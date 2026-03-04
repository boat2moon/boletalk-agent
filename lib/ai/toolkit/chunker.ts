/**
 * RAG 工具 — Markdown-aware 文档切分器
 *
 * 支持三种文件类型：
 * - .md：按标题分段 + 代码块保护
 * - .txt：按句子边界切分
 * - .pdf：pdf-parse 提取后按段落切分
 */

type ChunkMeta = {
  source: string;
  category: string;
  headerChain: string;
  chunkIndex: number;
};

export type DocumentChunk = {
  content: string;
  metadata: ChunkMeta;
};

const MAX_CHUNK_SIZE = 1500;
const OVERLAP_SIZE = 200;
const HEADER_REGEX = /^(#{1,6})\s+(.+)$/;
const SENTENCE_ENDERS = /([。！？.!?\n])/;

/**
 * 按标题拆分 Markdown 为段落（保护代码块不被切断）
 */
function splitMarkdownBySections(text: string): Array<{
  headerChain: string;
  content: string;
}> {
  const lines = text.split("\n");
  const sections: Array<{ headerChain: string; content: string }> = [];
  const headerStack: string[] = [];
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // 跟踪代码块状态
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentContent.push(line);
      continue;
    }

    // 代码块内的内容不拆分
    if (inCodeBlock) {
      currentContent.push(line);
      continue;
    }

    // 检测标题行
    const headerMatch = HEADER_REGEX.exec(line);
    if (headerMatch) {
      // 保存之前的段落
      if (currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content.length > 0) {
          sections.push({
            headerChain: headerStack.join(" > "),
            content,
          });
        }
        currentContent = [];
      }

      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // 更新标题栈
      while (headerStack.length >= level) {
        headerStack.pop();
      }
      headerStack.push(title);

      // 标题本身也加入内容
      currentContent.push(line);
    } else {
      currentContent.push(line);
    }
  }

  // 最后一段
  if (currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content.length > 0) {
      sections.push({
        headerChain: headerStack.join(" > "),
        content,
      });
    }
  }

  return sections;
}

/**
 * 对超长文本按句子边界二次切分
 */
function splitLongText(
  text: string,
  maxSize: number = MAX_CHUNK_SIZE,
  overlap: number = OVERLAP_SIZE
): string[] {
  if (text.length <= maxSize) {
    return [text];
  }

  // 中文/英文句子分隔符
  const parts = text.split(SENTENCE_ENDERS);

  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (current.length + part.length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      // 重叠：取上一段尾部
      const overlapText = current.slice(-overlap);
      current = overlapText + part;
    } else {
      current += part;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * 切分 Markdown 文件
 */
export function chunkMarkdown(
  text: string,
  source: string,
  category: string
): DocumentChunk[] {
  const sections = splitMarkdownBySections(text);
  const chunks: DocumentChunk[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    const subChunks = splitLongText(section.content);
    for (const subChunk of subChunks) {
      chunks.push({
        content: subChunk,
        metadata: {
          source,
          category,
          headerChain: section.headerChain,
          chunkIndex: globalIndex++,
        },
      });
    }
  }

  return chunks;
}

/**
 * 切分纯文本文件（无代码）
 */
export function chunkPlainText(
  text: string,
  source: string,
  category: string
): DocumentChunk[] {
  const subChunks = splitLongText(text, 1000, OVERLAP_SIZE);
  return subChunks.map((chunk, index) => ({
    content: chunk,
    metadata: {
      source,
      category,
      headerChain: "",
      chunkIndex: index,
    },
  }));
}

/**
 * 根据文件类型自动选择切分策略
 */
export function chunkDocument(
  text: string,
  source: string,
  category: string,
  fileType: "md" | "txt" | "pdf"
): DocumentChunk[] {
  switch (fileType) {
    case "md":
      return chunkMarkdown(text, source, category);
    case "txt":
      return chunkPlainText(text, source, category);
    case "pdf":
      // PDF 提取后的文本按段落切分，类似 markdown 策略
      return chunkMarkdown(text, source, category);
    default:
      return chunkPlainText(text, source, category);
  }
}
