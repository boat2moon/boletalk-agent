/**
 * RAG 索引脚本 — 扫描 RAG-DOC/ → 切分 → Embedding → 入库
 *
 * 用法: npx tsx scripts/rag-index.ts
 *
 * 只读处理，不改动 RAG-DOC/ 源文件。
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import postgres from "postgres";
import { chunkDocument } from "../lib/ai/toolkit/chunker";
import { embedTexts } from "../lib/ai/toolkit/embedding";

config({ path: ".env.local" });

const RAG_DOC_DIR = path.resolve("RAG-DOC");
const EMBEDDING_BATCH_SIZE = 8; // 每批 Embedding 的 chunk 数

// 分类映射
function getCategory(filePath: string): string {
  const relative = path.relative(RAG_DOC_DIR, filePath);
  if (relative.startsWith("面试题")) {
    return "面试题";
  }
  if (relative.startsWith("项目-伯乐Talk")) {
    return "伯乐Talk";
  }
  if (relative.startsWith("项目-入木AI")) {
    return "入木AI";
  }
  return "其他";
}

// 文件类型判断
function getFileType(filePath: string): "md" | "txt" | "pdf" | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") {
    return "md";
  }
  if (ext === ".txt") {
    return "txt";
  }
  if (ext === ".pdf") {
    return "pdf";
  }
  return null;
}

// 递归扫描目录
function scanDir(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDir(fullPath));
    } else {
      const fileType = getFileType(fullPath);
      if (fileType) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// 读取 PDF 文本（简单方式，无需额外依赖）
async function readPdfText(filePath: string): Promise<string> {
  try {
    // 动态导入 pdf-parse，可选依赖
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch {
    console.warn(`⚠️  无法解析 PDF: ${filePath}，跳过`);
    return "";
  }
}

async function main() {
  console.log("🔍 扫描 RAG-DOC/ 目录...\n");

  const files = scanDir(RAG_DOC_DIR);
  console.log(`📁 找到 ${files.length} 个文件\n`);

  // 连接数据库
  const dbUrl = process.env.POSTGRES_URL;
  if (!dbUrl) {
    throw new Error("POSTGRES_URL is not set");
  }
  const sql = postgres(dbUrl, { max: 1 });

  // 清空旧数据
  console.log("🗑️  清空旧的 RagChunk 数据...");
  await sql`DELETE FROM "RagChunk"`;

  let totalChunks = 0;
  let processedFiles = 0;

  for (const filePath of files) {
    const fileType = getFileType(filePath);
    if (!fileType) {
      continue;
    }
    const relativePath = path.relative(RAG_DOC_DIR, filePath);
    const category = getCategory(filePath);

    // 读取文件内容
    let text: string;
    if (fileType === "pdf") {
      text = await readPdfText(filePath);
      if (!text) {
        continue;
      }
    } else {
      text = fs.readFileSync(filePath, "utf-8");
    }

    if (text.trim().length === 0) {
      console.log(`⏭️  跳过空文件: ${relativePath}`);
      continue;
    }

    // 切分
    const chunks = chunkDocument(text, relativePath, category, fileType);

    if (chunks.length === 0) {
      console.log(`⏭️  无有效 chunk: ${relativePath}`);
      continue;
    }

    // 批量 Embedding + 入库
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      // 获取 embeddings
      const embeddings = await embedTexts(texts);

      // 写入数据库
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];
        const embeddingStr = `[${embedding.join(",")}]`;

        await sql`
          INSERT INTO "RagChunk" (content, embedding, source, category, "headerChain", "chunkIndex", metadata)
          VALUES (
            ${chunk.content},
            ${embeddingStr}::vector,
            ${chunk.metadata.source},
            ${chunk.metadata.category},
            ${chunk.metadata.headerChain},
            ${chunk.metadata.chunkIndex},
            ${JSON.stringify(chunk.metadata)}::jsonb
          )
        `;
      }

      totalChunks += batch.length;
    }

    processedFiles++;
    console.log(
      `✅ [${processedFiles}/${files.length}] ${relativePath} → ${chunks.length} chunks (${category})`
    );
  }

  console.log(
    `\n🎉 索引完成！共处理 ${processedFiles} 个文件，生成 ${totalChunks} 个 chunks`
  );

  // 验证
  const countResult = await sql`SELECT count(*) as cnt FROM "RagChunk"`;
  console.log(`📊 数据库中 RagChunk 总数: ${countResult[0].cnt}`);

  const catResult =
    await sql`SELECT category, count(*) as cnt FROM "RagChunk" GROUP BY category ORDER BY cnt DESC`;
  console.log("\n📊 分类统计:");
  for (const row of catResult) {
    console.log(`   ${row.category}: ${row.cnt}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("❌ 索引失败:", err);
  process.exit(1);
});
