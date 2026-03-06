/**
 * Avatar 子 Agent
 *
 * 从 /api/avatar/send/route.ts 提取的对话逻辑。
 * 封装了数字人面试的 LLM 调用和播报流程：
 * 1. 使用 toolkit 的 buildInterviewPrompt 构建面试官 Prompt
 * 2. 调用 generateText 生成面试官回复
 * 3. 逐句拆分文本并发送给数字人播报
 *
 * 将 Agent 逻辑与 HTTP 路由分离，使其可以被独立测试和扩展。
 */

import { type CoreMessage, generateText } from "ai";
import { sendAvatarText } from "@/lib/ai/avatar-client";
import { myProvider } from "@/lib/ai/providers";
import { buildInterviewPrompt } from "@/lib/ai/toolkit/prompt-builder";

const SENTENCE_SPLIT_RE = /(?<=[\u3002\uff01\uff1f\uff1b\n])/;

/**
 * 按句子分割文本
 * 对于数字人播报，需要逐句发送以实现更自然的播报节奏
 */
function splitBySentence(text: string): string[] {
  const sentences = text.split(SENTENCE_SPLIT_RE);
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

export type CreateAvatarResponseOptions = {
  /** 数字人 session ID（阿里云 RTC） */
  sessionId: string;
  /** 用户最新输入的文本 */
  userText: string;
  /** 对话历史 */
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  /** 简历分析上下文（首次发送时注入） */
  resumeContext?: string;
  /** 职位 JD 上下文（可选） */
  jobContext?: string;
  /** 是否打断当前正在播报的内容 */
  interrupt?: boolean;
};

/**
 * 执行 Avatar 面试官对话并播报
 *
 * 1. 使用共享 Prompt Builder 构建面试 Prompt
 * 2. 调用 Qwen 3.5 Flash 生成回复
 * 3. 逐句发送给数字人播报
 *
 * @returns 完整的回复文本
 */
export async function createAvatarResponse({
  sessionId,
  userText,
  messages = [],
  resumeContext,
  jobContext,
  interrupt = false,
}: CreateAvatarResponseOptions): Promise<string> {
  // 使用共享 Prompt Builder 构建面试官 System Prompt
  const systemPrompt = buildInterviewPrompt({
    mode: "avatar",
    resumeContext,
    jobContext,
  });

  const llmMessages: CoreMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    { role: "user", content: userText },
  ];

  // 调用 LLM 生成回复
  const { text: replyText } = await generateText({
    model: myProvider.languageModel("chat-model"),
    messages: llmMessages,
    maxRetries: 2,
  });

  // 逐句发送给数字人播报
  const sentences = splitBySentence(replyText);
  for (let i = 0; i < sentences.length; i++) {
    // 第一句使用 interrupt 标志（打断当前正在播报的内容）
    await sendAvatarText(sessionId, sentences[i], i === 0 && interrupt);
  }

  return replyText;
}
