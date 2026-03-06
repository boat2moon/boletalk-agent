/**
 * URL 内容抓取工具（共享工具层）
 *
 * 获取指定 URL 的网页内容（在线简历、技术文章等）。
 *
 * ═══════════════════════════════════════════════════════════
 * 环境适配说明：
 * - 【当前】直接 API 调用：使用 Node 原生 fetch，适用于所有环境（Serverless FC、本地开发等）
 * - 【备选】MCP 版本（已注释）：通过 Fetch MCP Server（stdio transport）调用，
 *    仅适用于长期运行的 Node.js 服务（本地开发、Docker 部署等），
 *    不适用于 Serverless 环境（FC/Lambda），因为 stdio 子进程会被冻结/回收。
 * ═══════════════════════════════════════════════════════════
 */

import { tool } from "ai";
import { z } from "zod";
import { fetchWithRetry } from "@/lib/utils/retry";

// ─── MCP 版本（仅适用于本地开发 / 长期运行的 Node.js 服务） ─────────
// import { getFetchMCPClient } from "@/lib/ai/mcp/mcp-clients";
//
// export const fetchUrlTool_MCP = tool({
//   description: "获取指定 URL 的网页内容（如在线简历、技术文章、项目文档）。",
//   inputSchema: z.object({
//     url: z.string().url().describe("要获取的网页 URL"),
//   }),
//   execute: async ({ url }) => {
//     try {
//       const client = await getFetchMCPClient();
//       const tools = await client.tools();
//       const fetchTool = tools.fetch;
//       if (!fetchTool) return "Fetch MCP Server 未提供 fetch 工具。";
//       const result = await fetchTool.execute(
//         { url },
//         { messages: [], toolCallId: `fetch-url-${Date.now()}` }
//       );
//       return typeof result === "string" ? result : JSON.stringify(result, null, 2);
//     } catch (error) {
//       const message = error instanceof Error ? error.message : "未知错误";
//       return `URL 内容获取失败: ${message}`;
//     }
//   },
// });

// ─── 直接 API 版本（适用于所有环境，包括 Serverless FC） ─────────

/**
 * URL 内容抓取 Tool
 *
 * 使用 Node 原生 fetch 直接获取网页内容，无需 MCP Server 子进程。
 * 自动将 HTML 内容截取为前 8000 字符以避免 token 溢出。
 */
export const fetchUrlTool = tool({
  description:
    "获取指定 URL 的网页内容（如在线简历、技术文章、项目文档）。当候选人分享了链接时使用此工具。",
  inputSchema: z.object({
    url: z.string().url().describe("要获取的网页 URL"),
  }),
  execute: async ({ url }) => {
    try {
      console.log(`[Fetch] 抓取: ${url}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetchWithRetry(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; BoleTalk/1.0; +https://bltalk.top)",
            Accept: "text/html,application/xhtml+xml,text/plain,*/*",
          },
          signal: controller.signal,
          redirect: "follow",
        },
        { maxRetries: 1 }
      );

      clearTimeout(timeout);

      if (!res.ok) {
        return `URL 请求失败: HTTP ${res.status} ${res.statusText}`;
      }

      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();

      // HTML 页面：简单提取文本内容
      if (contentType.includes("text/html")) {
        const cleaned = text
          // 移除 script/style 标签及内容
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          // 移除 HTML 标签
          .replace(/<[^>]+>/g, " ")
          // 合并空白
          .replace(/\s+/g, " ")
          .trim();
        const truncated = cleaned.slice(0, 8000);
        console.log(
          `[Fetch] 抓取完成，提取文本 ${truncated.length}/${cleaned.length} 字符`
        );
        return truncated + (cleaned.length > 8000 ? "\n\n[内容已截断]" : "");
      }

      // 纯文本 / JSON
      const truncated = text.slice(0, 8000);
      console.log(`[Fetch] 抓取完成，${truncated.length} 字符`);
      return truncated + (text.length > 8000 ? "\n\n[内容已截断]" : "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      console.error("[Fetch] 抓取失败:", message);
      if (message.includes("abort")) {
        return "URL 请求超时（15秒），请候选人直接在对话中描述相关内容。";
      }
      return `URL 内容获取失败: ${message}。请候选人直接在对话中描述相关内容。`;
    }
  },
});
