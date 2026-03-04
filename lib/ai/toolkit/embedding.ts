/**
 * RAG 工具 — Embedding 接口
 *
 * 可切换的 Embedding 提供商，测试阶段用智谱 Embedding-3，
 * 正式上线切换到阿里通义 Qwen3-Embedding。
 */

type EmbeddingProvider = "zhipu" | "qwen";

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const ZHIPU_MODEL = "embedding-3";
const ZHIPU_DIMENSIONS = 1024; // 降维到 1024，避免 pgvector 2000 维限制

// 当前使用的 provider
const CURRENT_PROVIDER: EmbeddingProvider = "zhipu";

/**
 * 调用智谱 Embedding-3 API
 */
async function zhipuEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error("ZHIPU_API_KEY is not set");
  }

  // 智谱 API 单次最多 16 条，需要分批
  const batchSize = 16;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ZHIPU_MODEL,
        input: batch,
        dimensions: ZHIPU_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Zhipu embedding API error: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // 按 index 排序确保顺序正确
    const sorted = data.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * 获取文本的向量嵌入
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (CURRENT_PROVIDER === "zhipu") {
    return await zhipuEmbed(texts);
  }
  throw new Error(`Unsupported embedding provider: ${CURRENT_PROVIDER}`);
}

/**
 * 获取单条文本的向量嵌入
 */
export async function embedQuery(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

/**
 * 获取当前 Embedding 维度
 */
export function getEmbeddingDimension(): number {
  if (CURRENT_PROVIDER === "zhipu") {
    return ZHIPU_DIMENSIONS;
  }
  if (CURRENT_PROVIDER === "qwen") {
    return 1024;
  }
  return 1024;
}
