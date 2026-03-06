/**
 * 消息分类节点（两层路由）
 *
 * 第一层：检查显式 intent 参数（确定性路由）
 * - intent='evaluate' → 直接返回 evaluate=true，跳过 LLM
 *
 * 第二层：无显式 intent 时，使用 AI SDK 的 generateObject + zod schema 进行 LLM 分类
 *
 * 分类结果包括：
 * - resume_opt: 简历优化
 * - mock_interview: 模拟面试
 * - evaluate: 面试评估
 * - related_topics: 编程/面试/简历相关话题
 * - others: 其他话题
 */

import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";

/**
 * 分类结果的 zod schema 定义
 * 使用 generateObject 让 AI 输出符合此结构的 JSON
 */
const classifySchema = z.object({
  resume_opt: z.boolean().describe("用户是否在询问简历优化相关的问题"),
  mock_interview: z.boolean().describe("用户是否在询问模拟面试相关的问题"),
  evaluate: z.boolean().describe("用户是否在请求对面试对话进行评估总结"),
  related_topics: z
    .boolean()
    .describe("用户是否在询问和编程、面试、简历相关的话题"),
  others: z.boolean().describe("用户是否在询问其他话题（不在上述范围内）"),
});

/** 分类结果类型，从 zod schema 推断 */
export type ClassifyResult = z.infer<typeof classifySchema>;

/**
 * 分类系统提示词
 * 告诉 AI 角色定位和输出规则，让 AI 能准确判断用户意图
 */
const classifySystemPrompt = `你是一个互联网大公司的资深程序员和面试官，尤其擅长前端技术栈，包括 HTML、CSS、JavaScript、TypeScript、React、Vue、Node.js、小程序等技术。

请根据用户输入的内容，判断用户属于哪一种情况？按说明输出 JSON 格式。

输出规则：
- resume_opt: 用户询问简历优化相关的问题
- mock_interview: 用户询问模拟面试相关的问题
- evaluate: 用户请求对面试对话进行评估总结（如"总结一下"、"评价一下"、"给个评分"等）
- related_topics: 用户询问和编程、面试、简历相关的话题
- others: 其他话题（不在上述范围内）

注意：每个字段都是布尔值，请根据用户输入准确判断。`;

/**
 * 两层路由：分类用户消息
 *
 * 第一层：如果有显式 intent，直接返回确定性结果（不调用 LLM）
 * 第二层：无 intent 时走 LLM 分类（概率性）
 *
 * @param messages - 用户消息列表
 * @param intent - 可选的显式意图标识（由前端按钮传入）
 * @returns 分类结果
 */
export async function classifyMessages(
  messages: ChatMessage[],
  intent?: string
): Promise<ClassifyResult> {
  // ── 第一层：显式 intent 确定性路由 ──
  if (intent === "evaluate") {
    return {
      resume_opt: false,
      mock_interview: false,
      evaluate: true,
      related_topics: false,
      others: false,
    };
  }

  // ── 第二层：LLM 分类（概率性路由）──
  const result = await generateObject({
    model: myProvider.languageModel("internal-model"),
    system: classifySystemPrompt,
    messages: convertToModelMessages(messages),
    schema: classifySchema,
  });

  return result.object;
}
