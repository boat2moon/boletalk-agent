/**
 * 记忆检索 Tool（memoryRead）
 *
 * 用户私域记忆检索工具，注册到各 Agent 的 tools 中，
 * 由 LLM 自主决定是否需要调用。
 *
 * 与 ragSearch（公域知识库）区分：
 * memoryRead 检索的是当前用户的个人数据（历史面试评估、上传简历等）。
 *
 * 使用工厂函数模式，每次请求绑定当前 userId 实现数据隔离。
 */

import { tool } from "ai";
import { z } from "zod";
import { formatMemoryContext, searchMemory } from "@/lib/ai/toolkit/memory";

/**
 * 创建 memoryRead Tool（绑定 userId）
 *
 * @param userId - 当前请求的用户 ID
 */
export function createMemoryReadTool(userId: string) {
  return tool({
    description: `从用户的个人记忆库中检索信息。记忆库包含该用户的过往面试评估摘要、历史对话要点等。
当需要参考用户的历史信息时应该调用此工具，例如：
- "我上次面试表现如何"
- "之前的面试评估结果"
- "我的面试历史"

不要在以下情况调用：
- 用户在进行当前面试（不需要回顾历史）
- 简单的技术问题（应该用 ragSearch）
- 不需要用户历史的通用问答`,
    inputSchema: z.object({
      query: z
        .string()
        .describe("语义检索查询，用自然语言描述要检索的用户历史信息"),
      category: z
        .enum(["interview", "resume", "note", "all"])
        .optional()
        .describe(
          "可选的分类过滤。interview=面试记录，resume=简历相关，note=笔记，all=全部"
        ),
    }),
    execute: async ({ query, category }) => {
      try {
        const effectiveCategory = category === "all" ? undefined : category;
        const results = await searchMemory(userId, query, {
          topK: 5,
          category: effectiveCategory,
        });

        if (results.length === 0) {
          return {
            found: false,
            context: "",
            message: "未找到相关的用户历史记忆",
          };
        }

        return {
          found: true,
          context: formatMemoryContext(results),
          resultCount: results.length,
        };
      } catch (err) {
        console.error("[memoryRead] Tool execution failed:", err);
        return {
          found: false,
          context: "",
          message: "记忆检索失败，请直接回答",
        };
      }
    },
  });
}
