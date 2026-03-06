/**
 * MCP HTTP 端点
 *
 * 使用 Streamable HTTP transport 暴露 Bole-MCP Server。
 * 遵循 MCP Streamable HTTP 规范（2025-03 起推荐）。
 *
 * 无状态模式（stateless）：
 * - 每个请求独立处理，不维护会话状态
 * - 适合 Next.js serverless 部署
 *
 * 使用方式：
 * - MCP Inspector: npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
 * - 任何 MCP 客户端连接到 /api/mcp 即可
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { boleMCPServer } from "@/lib/mcp/bole-server";

/**
 * 处理 MCP 请求的通用函数
 *
 * 每个请求创建新的 Transport 实例（stateless 模式），
 * 连接到共享的 MCP Server 实例后处理请求。
 */
async function handleMCPRequest(req: Request): Promise<Response> {
  try {
    // 每个请求创建新的 stateless transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless 模式
      enableJsonResponse: true, // 简单请求返回 JSON
    });

    // 连接 transport 到共享的 MCP server
    await boleMCPServer.connect(transport);

    // 处理请求并返回响应
    const response = await transport.handleRequest(req);
    return response;
  } catch (error) {
    console.error("[Bole-MCP] 请求处理失败:", error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32_603,
          message: "Internal server error",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// ─── HTTP 方法处理 ────────────────────────────────────

export function POST(req: Request): Promise<Response> {
  return handleMCPRequest(req);
}

export function GET(req: Request): Promise<Response> {
  return handleMCPRequest(req);
}

export function DELETE(req: Request): Promise<Response> {
  return handleMCPRequest(req);
}
