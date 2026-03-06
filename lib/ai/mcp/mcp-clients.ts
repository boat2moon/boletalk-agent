/**
 * MCP 客户端管理模块（共享工具/MCP 层）
 *
 * 统一管理所有外部 MCP Server 连接。
 * - GitHub / Fetch：通过 stdio transport 启动本地 MCP Server 子进程
 * - Tavily：通过 HTTP transport 连接远端 MCP Server
 *
 * ═══════════════════════════════════════════════════════════
 * 注意：本模块仅适用于本地开发 / 长期运行的 Node.js 服务。
 * 在 Serverless 环境（阿里云 FC / AWS Lambda 等）中，
 * stdio transport 的子进程会被冻结/回收，导致 MCP 连接失败。
 *
 * 当前各工具 execute 已改为直接 API 调用（无需本模块），
 * 但保留本模块代码以便未来在本地开发环境切回 MCP 模式。
 * ═══════════════════════════════════════════════════════════
 *
 * 当前接入的 MCP Server：
 * - GitHub MCP：拉取候选人开源项目、评价代码质量
 * - Tavily MCP：搜索候选人技术博客 / 社区贡献
 * - Fetch MCP：抓取在线简历页面、技术文章全文
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

// ─── 单例缓存 ─────────────────────────────────────────

let _githubClient: MCPClient | null = null;
let _webSearchClient: MCPClient | null = null;
let _fetchClient: MCPClient | null = null;

// ─── GitHub MCP 客户端 ────────────────────────────────

/**
 * 获取 GitHub MCP 客户端（单例）
 *
 * 使用官方 @modelcontextprotocol/server-github 包
 * 提供 search_repositories, get_file_contents, list_commits 等工具
 */
export async function getGitHubMCPClient(): Promise<MCPClient> {
  if (_githubClient) {
    return _githubClient;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN 环境变量未设置，无法启动 GitHub MCP Server");
  }

  _githubClient = await createMCPClient({
    transport: new StdioMCPTransport({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        ...(process.env as Record<string, string>),
        GITHUB_PERSONAL_ACCESS_TOKEN: token,
      },
    }),
  });

  return _githubClient;
}

// ─── Web Search MCP 客户端 (Tavily) ──────────────────

/**
 * 获取 Web Search MCP 客户端（单例）
 *
 * 使用 Tavily 的 Remote MCP 端点（HTTP transport）
 * 无需本地子进程，直接通过 HTTP 连接远端 MCP Server
 * 提供 tavily_search 等工具
 */
export async function getWebSearchMCPClient(): Promise<MCPClient> {
  if (_webSearchClient) {
    return _webSearchClient;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY 环境变量未设置，无法连接 Tavily MCP Server"
    );
  }

  _webSearchClient = await createMCPClient({
    transport: {
      type: "http",
      url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${apiKey}`,
    },
  });

  return _webSearchClient;
}

// ─── Fetch MCP 客户端 ─────────────────────────────────

/**
 * 获取 Fetch MCP 客户端（单例）
 *
 * 使用 @anthropic/mcp-server-fetch 包
 * 提供 fetch 等工具，可抓取任意 URL 内容
 */
export async function getFetchMCPClient(): Promise<MCPClient> {
  if (_fetchClient) {
    return _fetchClient;
  }

  _fetchClient = await createMCPClient({
    transport: new StdioMCPTransport({
      command: "npx",
      args: ["-y", "@anthropic/mcp-server-fetch"],
      env: process.env as Record<string, string>,
    }),
  });

  return _fetchClient;
}

// ─── 清理函数 ─────────────────────────────────────────

/**
 * 关闭所有 MCP 客户端连接
 * 用于应用退出时清理子进程
 */
export async function closeAllMCPClients(): Promise<void> {
  const clients = [_githubClient, _webSearchClient, _fetchClient];
  const closePromises = clients
    .filter(Boolean)
    .map((client) => client?.close().catch(console.error));

  await Promise.all(closePromises);

  _githubClient = null;
  _webSearchClient = null;
  _fetchClient = null;
}
