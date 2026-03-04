/**
 * RAG 工具 — 混合检索 + HyDE + ReRank + 引用溯源
 *
 * 共享工具层的 RAG 检索函数，各 Agent 按需调用。
 *
 * 检索管线：
 *   用户查询
 *   → HyDE（生成假设性回答文档）
 *   → 混合检索（向量 + 全文 + RRF 融合）
 *   → 去重（文本重叠检测）
 *   → ReRank（LLM 打分重排）
 *   → 引用溯源（附带来源信息）
 */

import { generateText } from "ai";
import postgres from "postgres";
import { embedQuery } from "./embedding";

// ─── 类型定义 ─────────────────────────────────────────

/** 引用溯源信息 */
export type Citation = {
  /** 来源文件（相对 RAG-DOC 的路径） */
  source: string;
  /** 父标题链（如 "## 面试题 > ### React"） */
  headerChain: string | null;
  /** 在原文中的 chunk 序号 */
  chunkIndex: number;
};

/** RAG 检索结果 */
export type RAGResult = {
  id: string;
  content: string;
  /** 综合得分（RRF 融合 + ReRank 加权） */
  score: number;
  /** 引用溯源 */
  citation: Citation;
  /** ReRank 相关性分数 (0-10) */
  relevanceScore?: number;
};

/** 检索选项 */
type SearchOptions = {
  topK?: number;
  category?: string;
  similarityThreshold?: number;
  /** 是否启用 HyDE（默认 true） */
  enableHyDE?: boolean;
  /** 是否启用 ReRank（默认 true） */
  enableReRank?: boolean;
};

// ─── 数据库连接 ───────────────────────────────────────

function getDbConnection() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not set");
  }
  return postgres(url);
}

// ─── HyDE：假设文档嵌入 ─────────────────────────────

/**
 * HyDE (Hypothetical Document Embeddings)
 *
 * 让 LLM 针对查询生成一个「假设性回答」，
 * 然后检索与这个假设回答语义相近的文档。
 * 这比直接用短查询做向量检索效果更好。
 */
async function generateHypotheticalDoc(query: string): Promise<string> {
  try {
    // 动态导入避免循环依赖
    const { myProvider } = await import("@/lib/ai/providers");

    const { text } = await generateText({
      model: myProvider.languageModel("chat-model-glm"),
      prompt: `请针对以下问题，写一段简短但信息丰富的回答（200字以内）。
这段回答将用于语义检索，所以请尽量包含相关的技术术语和关键概念。
不要说"我不知道"，直接写出你认为最可能的回答。

问题：${query}

回答：`,
    });
    return text;
  } catch (err) {
    console.warn(
      "HyDE generation failed, falling back to original query:",
      err
    );
    return query; // 降级为原始查询
  }
}

// ─── ReRank：LLM 重排 ──────────────────────────────

/**
 * ReRank — 使用 LLM 对候选结果打分
 *
 * 对初步检索的 Top-N 结果逐一评分（0-10），
 * 根据与原始查询的相关性重新排序。
 */
async function rerankResults(
  query: string,
  candidates: RAGResult[]
): Promise<RAGResult[]> {
  if (candidates.length === 0) {
    return [];
  }

  try {
    const { myProvider } = await import("@/lib/ai/providers");

    // 构建评估 prompt
    const candidateList = candidates
      .map(
        (c, i) =>
          `[文档${i + 1}]\n来源: ${c.citation.source}\n内容: ${c.content.slice(0, 500)}`
      )
      .join("\n\n");

    const { text } = await generateText({
      model: myProvider.languageModel("chat-model-glm"),
      prompt: `你是一个文档相关性评分器。请对以下候选文档与查询的相关性打分（0-10分）。

查询：${query}

${candidateList}

请仅输出每个文档的分数，格式为每行一个数字，按文档顺序排列。例如：
8
3
6

评分：`,
    });

    // 解析分数
    const scores = text
      .trim()
      .split("\n")
      .map((line) => {
        const num = Number.parseFloat(line.trim());
        return Number.isNaN(num) ? 5 : Math.min(10, Math.max(0, num));
      });

    // 更新分数并排序
    const reranked = candidates.map((c, i) => ({
      ...c,
      relevanceScore: scores[i] ?? 5,
      // 混合分数：原始RRF占40%，ReRank占60%
      score: c.score * 0.4 + ((scores[i] ?? 5) / 10) * 0.6,
    }));

    return reranked.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn("ReRank failed, using original ranking:", err);
    return candidates; // 降级为原始排序
  }
}

// ─── 混合检索核心 ───────────────────────────────────

/**
 * 混合检索主函数
 *
 * 管线：HyDE → 向量+全文 → RRF → 去重 → ReRank → 引用溯源
 */
export async function searchKnowledge(
  query: string,
  options: SearchOptions = {}
): Promise<RAGResult[]> {
  const {
    topK = 5,
    category,
    similarityThreshold = 0.95,
    enableHyDE = true,
    enableReRank = true,
  } = options;
  const fetchK = topK * 3;

  const sql = getDbConnection();

  try {
    // 1. HyDE：生成假设文档并用其检索
    let searchText = query;
    if (enableHyDE) {
      searchText = await generateHypotheticalDoc(query);
    }

    // 2. 获取查询向量（使用 HyDE 文档或原始查询）
    const queryEmbedding = await embedQuery(searchText);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // 3. 并行执行向量检索和全文检索
    const semanticQuery = category
      ? sql`
          SELECT id, content, source, category, "headerChain", "chunkIndex",
                 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM "RagChunk"
          WHERE category = ${category}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${fetchK}
        `
      : sql`
          SELECT id, content, source, category, "headerChain", "chunkIndex",
                 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM "RagChunk"
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${fetchK}
        `;

    // 全文检索用原始查询（不用 HyDE 文本）
    const ftsQuery = category
      ? sql`
          SELECT id, content, source, category, "headerChain", "chunkIndex",
                 ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', ${query})) AS rank
          FROM "RagChunk"
          WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
            AND category = ${category}
          ORDER BY rank DESC
          LIMIT ${fetchK}
        `
      : sql`
          SELECT id, content, source, category, "headerChain", "chunkIndex",
                 ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', ${query})) AS rank
          FROM "RagChunk"
          WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
          ORDER BY rank DESC
          LIMIT ${fetchK}
        `;

    const [semanticResults, ftsResults] = await Promise.all([
      semanticQuery,
      ftsQuery,
    ]);

    // 4. RRF 融合排序
    const k = 60;
    const scoreMap = new Map<
      string,
      RAGResult & { embedding_similarity: number }
    >();

    for (let i = 0; i < semanticResults.length; i++) {
      const row = semanticResults[i];
      scoreMap.set(row.id as string, {
        id: row.id as string,
        content: row.content as string,
        score: 1 / (k + i + 1),
        citation: {
          source: row.source as string,
          headerChain: row.headerChain as string | null,
          chunkIndex: row.chunkIndex as number,
        },
        embedding_similarity: Number(row.similarity),
      });
    }

    for (let i = 0; i < ftsResults.length; i++) {
      const row = ftsResults[i];
      const rrfScore = 1 / (k + i + 1);
      const existing = scoreMap.get(row.id as string);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(row.id as string, {
          id: row.id as string,
          content: row.content as string,
          score: rrfScore,
          citation: {
            source: row.source as string,
            headerChain: row.headerChain as string | null,
            chunkIndex: row.chunkIndex as number,
          },
          embedding_similarity: 0,
        });
      }
    }

    // 5. 按 RRF 分数排序
    const sorted = Array.from(scoreMap.values()).sort(
      (a, b) => b.score - a.score
    );

    // 6. 文本去重
    const deduplicated: RAGResult[] = [];
    for (const item of sorted) {
      let isDuplicate = false;
      for (const existing of deduplicated) {
        if (
          calculateTextOverlap(item.content, existing.content) >
          similarityThreshold
        ) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        deduplicated.push({
          id: item.id,
          content: item.content,
          score: item.score,
          citation: item.citation,
        });
      }
      // ReRank 前多保留一些候选
      if (deduplicated.length >= topK * 2) {
        break;
      }
    }

    // 7. ReRank
    let finalResults = deduplicated;
    if (enableReRank && deduplicated.length > 1) {
      finalResults = await rerankResults(query, deduplicated);
    }

    return finalResults.slice(0, topK);
  } finally {
    await sql.end();
  }
}

// ─── 辅助函数 ───────────────────────────────────────

function calculateTextOverlap(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  if (shorter.length === 0) {
    return 0;
  }

  const windowSize = Math.min(100, shorter.length);
  let matchCount = 0;
  const step = Math.max(1, Math.floor(shorter.length / 20));

  for (let i = 0; i <= shorter.length - windowSize; i += step) {
    const window = shorter.slice(i, i + windowSize);
    if (longer.includes(window)) {
      matchCount++;
    }
  }

  const totalWindows = Math.ceil((shorter.length - windowSize + 1) / step);
  return totalWindows > 0 ? matchCount / totalWindows : 0;
}

// ─── 格式化输出（含引用溯源） ──────────────────────

/**
 * 将 RAG 检索结果格式化为 Prompt 上下文（含引用溯源标注）
 */
export function formatRAGContext(results: RAGResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const contextParts = results.map((r, i) => {
    const headerInfo = r.citation.headerChain
      ? ` > ${r.citation.headerChain}`
      : "";
    const relevance =
      r.relevanceScore !== undefined ? ` (相关度: ${r.relevanceScore}/10)` : "";
    return `--- [REF-${i + 1}] ${r.citation.source}${headerInfo}${relevance} ---\n${r.content}`;
  });

  return `\n以下是从知识库检索到的相关参考资料。请在回答中引用时使用 [REF-N] 标记来源：\n\n${contextParts.join("\n\n")}`;
}

/**
 * 从 RAG 结果生成引用列表（附在回答末尾）
 */
export function formatCitations(results: RAGResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const lines = results.map((r, i) => {
    const header = r.citation.headerChain ? ` → ${r.citation.headerChain}` : "";
    return `[REF-${i + 1}] 📄 ${r.citation.source}${header}`;
  });

  return `\n---\n📚 参考来源：\n${lines.join("\n")}`;
}
