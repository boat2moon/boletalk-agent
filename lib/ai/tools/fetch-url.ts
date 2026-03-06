/**
 * URL 内容抓取工具（共享工具/MCP 层）
 *
 * 通过 Fetch MCP Server 获取指定 URL 的网页内容：
 * - 在线简历页面
 * - 技术文章全文
 * - 博客帖子
 * - 项目文档
 *
 * 用于候选人分享了在线链接后，Agent 自动获取内容。
 */

import { tool } from "ai";
import { z } from "zod";
import { getFetchMCPClient } from "@/lib/ai/mcp/mcp-clients";

/**
 * URL 内容抓取 Tool
 *
 * 当候选人在对话中分享了 URL（在线简历、技术文章等）时，
 * Agent 可使用此工具获取页面内容。
 */
export const fetchUrlTool = tool({
  description:
    "获取指定 URL 的网页内容（如在线简历、技术文章、项目文档）。当候选人分享了链接时使用此工具。",
  inputSchema: z.object({
    url: z.string().url().describe("要获取的网页 URL"),
  }),
  execute: async ({ url }) => {
    try {
      console.log(`[Fetch MCP] 抓取: ${url}`);

      const client = await getFetchMCPClient();
      const tools = await client.tools();

      // Fetch MCP Server 提供 fetch 工具
      const fetchTool = tools.fetch;
      if (!fetchTool) {
        return "Fetch MCP Server 未提供 fetch 工具，无法获取 URL 内容。";
      }

      const result = await fetchTool.execute(
        { url },
        {
          messages: [],
          toolCallId: `fetch-url-${Date.now()}`,
        }
      );

      console.log("[Fetch MCP] 抓取完成");

      if (typeof result === "string") {
        return result;
      }
      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      console.error("[Fetch MCP] 抓取失败:", message);
      return `URL 内容获取失败: ${message}。请候选人直接在对话中描述相关内容。`;
    }
  },
});
