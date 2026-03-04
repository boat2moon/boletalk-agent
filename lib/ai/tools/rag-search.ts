/**
 * RAG 知识库检索 Tool
 *
 * 共享工具层的 RAG 检索工具，注册到各 Agent 的 tools 中，
 * 由 LLM 自主决定是否需要调用。
 *
 * 当用户提出技术问题、面试题、项目相关问题时，
 * LLM 会调用此工具从知识库中检索相关参考资料。
 */

import { tool } from "ai";
import { z } from "zod";
import {
  formatCitations,
  formatRAGContext,
  searchKnowledge,
} from "@/lib/ai/toolkit/rag";

/**
 * RAG 知识库检索 Tool
 *
 * LLM 可传入搜索查询和可选的分类过滤，
 * 返回格式化的参考资料和引用来源。
 */
export const ragSearchTool = tool({
  description: `从知识库中检索相关参考资料。当用户提出以下类型的问题时应该调用此工具：
- 技术问题（前端/后端/算法等）
- 面试相关问题
- 项目架构、实现细节相关问题
- 需要引用具体文档或教程的问题

不要在以下情况调用：
- 简单的打招呼、闲聊
- 用户提供简历内容让你评审
- 不需要外部知识即可回答的问题`,
  inputSchema: z.object({
    query: z.string().describe("搜索查询，用自然语言描述要检索的内容"),
    category: z
      .enum(["面试题", "伯乐Talk", "入木AI"])
      .optional()
      .describe(
        "可选的分类过滤。面试题=面试相关题库，伯乐Talk=项目文档，入木AI=入木AI项目文档"
      ),
  }),
  execute: async ({ query, category }) => {
    try {
      const results = await searchKnowledge(query, {
        topK: 5,
        category,
      });

      if (results.length === 0) {
        return {
          found: false,
          context: "",
          citations: "",
          message: "未找到相关参考资料",
        };
      }

      return {
        found: true,
        context: formatRAGContext(results),
        citations: formatCitations(results),
        resultCount: results.length,
      };
    } catch (err) {
      console.error("[ragSearch] Tool execution failed:", err);
      return {
        found: false,
        context: "",
        citations: "",
        message: "检索失败，请直接回答",
      };
    }
  },
});
