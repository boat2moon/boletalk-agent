/**
 * 消息分类节点
 *
 * 使用 AI SDK 的 generateObject + zod schema，实现结构化输出。
 * 输入用户 messages，让 AI 判断用户意图并输出分类结果。
 *
 * 分类结果包括：
 * - resume_opt: 简历优化
 * - mock_interview: 模拟面试
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
- related_topics: 用户询问和编程、面试、简历相关的话题
- others: 其他话题（不在上述范围内）

注意：每个字段都是布尔值，请根据用户输入准确判断。`;

/**
 * AI SDK workflow 节点：分类用户消息
 *
 * 使用 generateObject 调用 AI，传入 messages 和 zod schema，
 * AI 会按照 schema 的结构输出 JSON 格式的分类结果。
 *
 * @param messages - 用户消息列表
 * @returns 分类结果，包含 resume_opt、mock_interview、related_topics、others 四个布尔字段
 */
export async function classifyMessages(
  messages: ChatMessage[]
): Promise<ClassifyResult> {
  // 调用 AI SDK 的 generateObject，让 AI 输出结构化数据
  // 和普通的 generateText 不同，generateObject 会强制 AI 输出符合 schema 的 JSON
  const result = await generateObject({
    model: myProvider.languageModel("chat-model"),
    system: classifySystemPrompt,
    messages: convertToModelMessages(messages),
    schema: classifySchema,
  });

  return result.object;
}
