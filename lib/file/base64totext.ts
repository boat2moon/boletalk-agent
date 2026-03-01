// pdf-parse 1.x 版本有一个已知 bug：从包根目录导入时会尝试加载测试文件
// 解决方案：直接导入其内部的 lib/pdf-parse.js 绕过这个问题
// @ts-expect-error
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * 将 base64 编码的 PDF 文件解析为纯文本
 *
 * 流程：base64 字符串 → Buffer（二进制）→ pdf-parse 解析 → 纯文本
 *
 * @param base64Str - PDF 文件的 base64 编码字符串（不含 data: 前缀）
 * @returns 解析出的纯文本内容
 */
export async function base64ToText(base64Str: string): Promise<string> {
  // 步骤1：将 base64 字符串解码为 Buffer（二进制数据）
  const pdfBuffer = Buffer.from(base64Str, "base64");

  // 步骤2：使用 pdf-parse 解析 PDF 二进制数据，提取其中的文本内容
  const pdfData = await pdfParse(pdfBuffer);

  // pdfData.text 包含 PDF 中所有页面的纯文本内容（去除了格式、图片等）
  return pdfData.text;
}
