/**
 * Web Search 工具（共享工具/MCP 层）
 *
 * 通过 Tavily Remote MCP Server 搜索候选人的公开技术内容：
 * - 技术博客文章
 * - Stack Overflow 回答
 * - 社区贡献（掘金、知乎、SegmentFault 等）
 * - 会议演讲、开源贡献等
 *
 * 配合 GitHub 分析形成「代码 + 文章 + 社区」三维候选人评估。
 */

import { tool } from "ai";
import { z } from "zod";
import { getWebSearchMCPClient } from "@/lib/ai/mcp/mcp-clients";

/**
 * Web 搜索 Tool
 *
 * Agent 在面试中按需搜索候选人的公开技术内容。
 */
export const webSearchTool = tool({
  description:
    "搜索候选人的技术博客、社区贡献、Stack Overflow 回答等公开信息。用于佐证候选人的技术深度和社区影响力。",
  inputSchema: z.object({
    query: z.string().describe("搜索关键词，如候选人姓名+技术关键词"),
  }),
  execute: async ({ query }) => {
    try {
      console.log(`[Web Search MCP] 搜索: ${query}`);

      const client = await getWebSearchMCPClient();
      const tools = await client.tools();

      // Tavily MCP Server 提供 search / tavily_search 工具
      const searchTool =
        tools.search || tools.tavily_search || tools.web_search;

      if (!searchTool) {
        const availableTools = Object.keys(tools).join(", ");
        return `Tavily MCP Server 未提供预期的搜索工具（可用工具: ${availableTools}）`;
      }

      const result = await searchTool.execute(
        { query },
        {
          messages: [],
          toolCallId: `web-search-${Date.now()}`,
        }
      );

      console.log("[Web Search MCP] 搜索完成");

      if (typeof result === "string") {
        return result;
      }
      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      console.error("[Web Search MCP] 搜索失败:", message);
      return `搜索失败: ${message}。可以请候选人直接介绍他们的技术输出。`;
    }
  },
});
