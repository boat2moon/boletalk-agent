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

const MCP_API_KEY = process.env.MCP_API_KEY;

/**
 * Bearer Token 鉴权
 *
 * 若配置了 MCP_API_KEY 环境变量，则校验 Authorization 头；
 * 未配置时跳过鉴权（开发环境便捷调试）。
 */
function authenticate(req: Request): Response | null {
  if (!MCP_API_KEY) {
    return null; // 未配置 → 跳过鉴权
  }

  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${MCP_API_KEY}`) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32_600, message: "Unauthorized" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  return null; // 鉴权通过
}

/**
 * 处理 MCP 请求的通用函数
 *
 * 每个请求创建新的 Transport 实例（stateless 模式），
 * 连接到共享的 MCP Server 实例后处理请求。
 */
async function handleMCPRequest(req: Request): Promise<Response> {
  // Bearer Token 鉴权
  const authError = authenticate(req);
  if (authError) {
    return authError;
  }

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
