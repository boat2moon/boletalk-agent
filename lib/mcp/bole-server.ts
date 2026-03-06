/**
 * Bole-MCP Server
 *
 * 将伯乐Talk 的核心能力以 MCP (Model Context Protocol) 协议暴露，
 * 让任何 MCP 兼容的 AI 客户端可以直接调用。
 *
 * 暴露的 Tools：
 * - bole/resume-analyze：简历分析（结构化输出）
 * - bole/interview-evaluate：面试评估（多维评分）
 * - bole/rag-search：知识库检索（混合检索 + HyDE + ReRank）
 *
 * 架构设计：
 * - Server 实例为单例，所有请求共享
 * - 每个 API 请求创建新的 Transport（stateless 模式）
 * - 底层复用现有的共享工具层实现
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type EvaluationResult,
  generateEvaluation,
} from "@/lib/ai/agent/evaluate";
import {
  formatCitations,
  formatRAGContext,
  searchKnowledge,
} from "@/lib/ai/toolkit/rag";
import {
  analyzeResume,
  type ResumeAnalysis,
} from "@/lib/ai/toolkit/resume-analyzer";

// ─── MCP Server 实例（单例） ──────────────────────────

const server = new McpServer({
  name: "Bole-MCP",
  version: "1.0.0",
});

// ─── Tool: 简历分析 ──────────────────────────────────

server.tool(
  "bole/resume-analyze",
  "分析程序员简历，输出结构化的面试上下文（背景概述、技术栈、亮点、不足、建议面试方向）",
  {
    resumeText: z.string().describe("纯文本格式的简历内容"),
  },
  async ({
    resumeText,
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> => {
    console.log("[Bole-MCP] 调用 bole/resume-analyze");

    const result: ResumeAnalysis = await analyzeResume(resumeText);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ─── Tool: 面试评估 ──────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  parts: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
});

server.tool(
  "bole/interview-evaluate",
  "基于完整面试对话历史，生成多维度评估报告（技术能力、沟通表达、逻辑思维、项目理解、综合评价）",
  {
    messages: z
      .array(messageSchema)
      .describe("面试对话历史，每条消息包含 role 和 parts"),
  },
  async ({
    messages,
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> => {
    console.log("[Bole-MCP] 调用 bole/interview-evaluate");

    // 转换为 ChatMessage 格式
    const chatMessages = messages.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    }));

    const result: EvaluationResult = await generateEvaluation(chatMessages);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ─── Tool: RAG 知识库检索 ─────────────────────────────

server.tool(
  "bole/rag-search",
  "从面试知识库中检索相关参考资料（支持面试题、项目文档等分类过滤）",
  {
    query: z.string().describe("搜索查询，用自然语言描述要检索的内容"),
    category: z
      .string()
      .optional()
      .describe("可选的分类过滤：面试题、伯乐Talk、入木AI"),
  },
  async ({
    query,
    category,
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> => {
    console.log(`[Bole-MCP] 调用 bole/rag-search: ${query}`);

    const results = await searchKnowledge(query, {
      topK: 5,
      category,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "未找到相关参考资料",
          },
        ],
      };
    }

    const context = formatRAGContext(results);
    const citations = formatCitations(results);

    return {
      content: [
        {
          type: "text" as const,
          text: `${context}\n\n---\n引用来源：\n${citations}`,
        },
      ],
    };
  }
);

export { server as boleMCPServer };
