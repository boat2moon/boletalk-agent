/**
 * 记忆系统 — per-user 私域 RAG（检索 + 写入）
 *
 * 与公域 ragSearch（RagChunk 表）区分：
 * 记忆系统作用于 MemoryChunk 表，按 userId 隔离。
 *
 * 检索管线（轻量版，不使用 HyDE/ReRank 以保低延迟）：
 *   用户查询
 *   → 向量检索 + 全文检索
 *   → RRF 融合 + 去重
 *   → 返回结果
 *
 * 写入管线：
 *   文本内容
 *   → 切分（复用 chunker.ts）
 *   → 向量化（复用 embedding.ts）
 *   → 写入 MemoryChunk 表
 */

import postgres from "postgres";
import { chunkPlainText } from "./chunker";
import { embedQuery, embedTexts } from "./embedding";

// ─── 类型定义 ─────────────────────────────────────────

/** 记忆检索结果 */
export type MemoryResult = {
  id: string;
  content: string;
  /** RRF 综合得分 */
  score: number;
  /** 来源标识 */
  source: string;
  /** 分类 */
  category: string;
  /** 扩展元数据（chatId, scores 等） */
  metadata: Record<string, unknown> | null;
  /** 创建时间 */
  createdAt: Date | null;
};

/** 记忆检索选项 */
type MemorySearchOptions = {
  topK?: number;
  category?: string;
  /** 向量余弦相似度最低阈值，低于此值的结果在 SQL 层直接丢弃（默认 0.3） */
  minSimilarity?: number;
  /** 文本重叠度阈值，用于去重相似内容的 chunk（默认 0.95） */
  textOverlapThreshold?: number;
};

// ─── 数据库连接 ───────────────────────────────────────

function getDbConnection() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not set");
  }
  return postgres(url);
}

// ─── 记忆检索 ─────────────────────────────────────────

/**
 * 检索用户的私域记忆
 *
 * 轻量版管线：向量检索 + 全文检索 + RRF 融合（不做 HyDE/ReRank）
 */
export async function searchMemory(
  userId: string,
  query: string,
  options: MemorySearchOptions = {}
): Promise<MemoryResult[]> {
  const {
    topK = 5,
    category,
    minSimilarity = 0.3,
    textOverlapThreshold = 0.95,
  } = options;
  const fetchK = topK * 3;

  const sql = getDbConnection();

  try {
    // 1. 获取查询向量
    const queryEmbedding = await embedQuery(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // 2. 并行执行向量检索和全文检索（向量检索带相似度阈值过滤，均带 userId 过滤）
    const semanticQuery = category
      ? sql`
          SELECT id, content, source, category, metadata, "createdAt",
                 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM "MemoryChunk"
          WHERE "userId" = ${userId}::uuid AND category = ${category}
            AND 1 - (embedding <=> ${embeddingStr}::vector) > ${minSimilarity}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${fetchK}
        `
      : sql`
          SELECT id, content, source, category, metadata, "createdAt",
                 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM "MemoryChunk"
          WHERE "userId" = ${userId}::uuid
            AND 1 - (embedding <=> ${embeddingStr}::vector) > ${minSimilarity}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${fetchK}
        `;

    const ftsQuery = category
      ? sql`
          SELECT id, content, source, category, metadata, "createdAt",
                 ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', ${query})) AS rank
          FROM "MemoryChunk"
          WHERE "userId" = ${userId}::uuid
            AND category = ${category}
            AND to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
          ORDER BY rank DESC
          LIMIT ${fetchK}
        `
      : sql`
          SELECT id, content, source, category, metadata, "createdAt",
                 ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', ${query})) AS rank
          FROM "MemoryChunk"
          WHERE "userId" = ${userId}::uuid
            AND to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
          ORDER BY rank DESC
          LIMIT ${fetchK}
        `;

    const [semanticResults, ftsResults] = await Promise.all([
      semanticQuery,
      ftsQuery,
    ]);

    // 3. RRF 融合排序
    const k = 60;
    const scoreMap = new Map<string, MemoryResult>();

    for (let i = 0; i < semanticResults.length; i++) {
      const row = semanticResults[i];
      scoreMap.set(row.id as string, {
        id: row.id as string,
        content: row.content as string,
        score: 1 / (k + i + 1),
        source: row.source as string,
        category: row.category as string,
        metadata: row.metadata as Record<string, unknown> | null,
        createdAt: row.createdAt as Date | null,
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
          source: row.source as string,
          category: row.category as string,
          metadata: row.metadata as Record<string, unknown> | null,
          createdAt: row.createdAt as Date | null,
        });
      }
    }

    // 4. 按 RRF 分数排序
    const sorted = Array.from(scoreMap.values()).sort(
      (a, b) => b.score - a.score
    );

    // 5. 文本重叠去重（与全局 RAG 对齐，避免 chunk overlap 导致的重复结果）
    const deduplicated: MemoryResult[] = [];
    for (const item of sorted) {
      let isDuplicate = false;
      for (const existing of deduplicated) {
        if (
          calculateTextOverlap(item.content, existing.content) >
          textOverlapThreshold
        ) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        deduplicated.push(item);
      }
      if (deduplicated.length >= topK) {
        break;
      }
    }

    return deduplicated;
  } finally {
    await sql.end();
  }
}

// ─── 辅助函数 ───────────────────────────────────────

/**
 * 计算两段文本的重叠度（滑动窗口匹配）
 * 与 rag.ts 中的同名函数保持一致
 */
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

// ─── 记忆写入 ─────────────────────────────────────────

/** 记忆写入参数 */
type WriteMemoryOptions = {
  userId: string;
  content: string;
  source: string;
  category: string;
  metadata?: Record<string, unknown>;
};

/**
 * 将文本内容写入用户的私域记忆
 *
 * 流程：文本切分 → 向量化 → 写入 MemoryChunk 表
 * 同一 source 的旧记忆会被先删后插（确保最新）
 */
export async function writeMemory({
  userId,
  content,
  source,
  category,
  metadata,
}: WriteMemoryOptions): Promise<{ chunksWritten: number }> {
  const sql = getDbConnection();

  try {
    // 1. 切分文本
    const chunks = chunkPlainText(content, source, category);

    if (chunks.length === 0) {
      return { chunksWritten: 0 };
    }

    // 2. 批量向量化
    const texts = chunks.map((c) => c.content);
    const embeddings = await embedTexts(texts);

    // 3. 先删除同一 source 的旧记忆（幂等更新）
    await sql`
      DELETE FROM "MemoryChunk"
      WHERE "userId" = ${userId}::uuid AND source = ${source}
    `;

    // 4. 批量插入新记忆
    const values = chunks.map((chunk, i) => ({
      userId,
      content: chunk.content,
      embedding: `[${embeddings[i].join(",")}]`,
      source,
      category,
      headerChain: chunk.metadata.headerChain || null,
      chunkIndex: chunk.metadata.chunkIndex,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }));

    for (const val of values) {
      await sql`
        INSERT INTO "MemoryChunk" ("userId", content, embedding, source, category, "headerChain", "chunkIndex", metadata)
        VALUES (
          ${val.userId}::uuid,
          ${val.content},
          ${val.embedding}::vector,
          ${val.source},
          ${val.category},
          ${val.headerChain},
          ${val.chunkIndex},
          ${val.metadata}::jsonb
        )
      `;
    }

    return { chunksWritten: values.length };
  } finally {
    await sql.end();
  }
}

// ─── 格式化输出 ─────────────────────────────────────────

/**
 * 将记忆检索结果格式化为 Prompt 上下文
 */
export function formatMemoryContext(results: MemoryResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const contextParts = results.map((r, i) => {
    const time = r.createdAt
      ? new Date(r.createdAt).toLocaleDateString("zh-CN")
      : "未知时间";
    return `--- [记忆-${i + 1}] ${r.source} (${r.category}) ${time} ---\n${r.content}`;
  });

  return `\n以下是从该用户的个人记忆库中检索到的历史信息：\n\n${contextParts.join("\n\n")}`;
}

// ─── 会话记忆写入 ─────────────────────────────────────────

/** 消息 parts 中的文本部分 */
type MessagePart = { type: string; text?: string };

/**
 * 将消息列表转换为纯文本（用于记忆入库）
 *
 * 提取每条消息的 role + text parts，拼接为对话记录格式。
 */
export function messagesToPlainText(
  messages: Array<{ role: string; parts: unknown }>
): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === "user" ? "用户" : "面试官";
    const parts = msg.parts as MessagePart[];
    if (!Array.isArray(parts)) {
      continue;
    }

    const textParts = parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n");

    if (textParts) {
      lines.push(`${role}：${textParts}`);
    }
  }

  return lines.join("\n\n");
}

/** 会话记忆写入参数 */
type WriteChatMemoryOptions = {
  userId: string;
  chatId: string;
  messages: Array<{ role: string; parts: unknown }>;
  /** 评估结果（可选，评估成功时传入） */
  evaluationResult?: {
    scores: Record<string, number>;
    comments: Record<string, unknown>;
  };
};

/**
 * 将完整会话记录（+ 可选评估结果）写入用户记忆
 *
 * 按 chatId 幂等：先删除该会话的所有记忆片段，再重新入库。
 * 包含两部分：
 * 1. 会话完整文本（始终写入）
 * 2. 评估摘要（仅评估成功时写入）
 *
 * 整个过程为后台异步（fire-and-forget），不阻塞其他操作。
 */
export async function writeChatMemory({
  userId,
  chatId,
  messages,
  evaluationResult,
}: WriteChatMemoryOptions): Promise<{ chunksWritten: number }> {
  // 1. 将会话记录转为纯文本
  const chatText = messagesToPlainText(messages);
  if (!chatText) {
    return { chunksWritten: 0 };
  }

  let totalChunks = 0;

  // 2. 写入会话文本（source = chat-{chatId}，幂等覆盖）
  const chatResult = await writeMemory({
    userId,
    content: chatText,
    source: `chat-${chatId}`,
    category: "interview",
    metadata: { chatId },
  });
  totalChunks += chatResult.chunksWritten;

  // 3. 如果评估成功，额外写入评估摘要（source = evaluation-{chatId}）
  if (evaluationResult) {
    const summary = evaluationResult.comments.summary ?? "";
    const memorySummary = `面试评估摘要：\n综合评分：${evaluationResult.scores.overall ?? "N/A"}/10\n技术能力：${evaluationResult.scores.technical ?? "N/A"}/10\n沟通表达：${evaluationResult.scores.communication ?? "N/A"}/10\n${summary}`;

    const evalResult = await writeMemory({
      userId,
      content: memorySummary,
      source: `evaluation-${chatId}`,
      category: "interview",
      metadata: { chatId, scores: evaluationResult.scores },
    });
    totalChunks += evalResult.chunksWritten;
  }

  return { chunksWritten: totalChunks };
}
