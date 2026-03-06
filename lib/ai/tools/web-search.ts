/**
 * Web Search 工具（共享工具层）
 *
 * 搜索候选人的技术博客、社区贡献等公开信息。
 *
 * ═══════════════════════════════════════════════════════════
 * 环境适配说明：
 * - 【当前】直接 API 调用：使用 Tavily REST API（Node fetch），适用于所有环境
 * - 【备选】MCP 版本（已注释）：通过 Tavily Remote MCP Server（HTTP transport）调用，
 *    理论上也适用于 Serverless，但实测在阿里云 FC 中偶发网络超时。
 *    适用于本地开发或网络环境稳定的服务器部署。
 * ═══════════════════════════════════════════════════════════
 */

import { tool } from "ai";
import { z } from "zod";

// ─── MCP 版本（通过 Tavily Remote MCP Server） ────────────────────
// import { getWebSearchMCPClient } from "@/lib/ai/mcp/mcp-clients";
//
// export const webSearchTool_MCP = tool({
//   description: "搜索候选人的技术博客、社区贡献等公开信息。",
//   inputSchema: z.object({
//     query: z.string().describe("搜索关键词"),
//   }),
//   execute: async ({ query }) => {
//     try {
//       const client = await getWebSearchMCPClient();
//       const tools = await client.tools();
//       const searchTool = tools.search || tools.tavily_search || tools.web_search;
//       if (!searchTool) {
//         return `Tavily MCP Server 未提供预期的搜索工具（可用: ${Object.keys(tools).join(", ")}）`;
//       }
//       const result = await searchTool.execute(
//         { query },
//         { messages: [], toolCallId: `web-search-${Date.now()}` }
//       );
//       return typeof result === "string" ? result : JSON.stringify(result, null, 2);
//     } catch (error) {
//       const message = error instanceof Error ? error.message : "未知错误";
//       return `搜索失败: ${message}`;
//     }
//   },
// });

// ─── 直接 API 版本（适用于所有环境，包括 Serverless FC） ─────────

/**
 * Web 搜索 Tool
 *
 * 使用 Tavily Search REST API 直接搜索，无需 MCP Server。
 * API 文档: https://docs.tavily.com/documentation/api-reference/search
 */
export const webSearchTool = tool({
  description:
    "搜索候选人的技术博客、社区贡献、Stack Overflow 回答等公开信息。用于佐证候选人的技术深度和社区影响力。",
  inputSchema: z.object({
    query: z.string().describe("搜索关键词，如候选人姓名+技术关键词"),
  }),
  execute: async ({ query }) => {
    try {
      console.log(`[Web Search] 搜索: ${query}`);

      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        return "TAVILY_API_KEY 未设置，无法执行搜索。";
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          include_answer: true,
          search_depth: "basic",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return `Tavily 搜索失败: HTTP ${res.status} ${errText}`;
      }

      const data = (await res.json()) as {
        answer?: string;
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
        }>;
      };

      console.log(`[Web Search] 搜索完成，${data.results?.length ?? 0} 条结果`);

      // 格式化结果
      const parts: string[] = [];

      if (data.answer) {
        parts.push(`**摘要**: ${data.answer}`);
      }

      if (data.results && data.results.length > 0) {
        parts.push("\n**搜索结果**:");
        for (const r of data.results) {
          const snippet = r.content
            ? r.content.slice(0, 300) + (r.content.length > 300 ? "..." : "")
            : "";
          parts.push(
            `- [${r.title || "无标题"}](${r.url || ""})\n  ${snippet}`
          );
        }
      }

      return parts.join("\n") || "未找到相关结果。";
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      console.error("[Web Search] 搜索失败:", message);
      if (message.includes("abort")) {
        return "搜索超时（15秒），可以请候选人直接介绍他们的技术输出。";
      }
      return `搜索失败: ${message}。可以请候选人直接介绍他们的技术输出。`;
    }
  },
});
