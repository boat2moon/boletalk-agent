/**
 * 数字人播报文本 API
 *
 * POST /api/avatar/send
 *
 * 工作流程：
 * 1. 接收用户文本和当前对话上下文
 * 2. 调用 Agent LLM 生成面试官回复
 * 3. 将回复文本逐句发送给数字人播报（SendText）
 * 4. 返回完整回复文本给前端显示
 */

import { type CoreMessage, generateText } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { sendAvatarText } from "@/lib/ai/avatar-client";
import { myProvider } from "@/lib/ai/providers";
import { ChatSDKError } from "@/lib/errors";

const requestSchema = z.object({
  /** 数字人 session ID */
  sessionId: z.string(),
  /** 用户最新输入的文本 */
  userText: z.string().min(1),
  /** 对话历史（用于上下文） */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  /** 简历分析摘要（首次发送时注入） */
  resumeContext: z.string().optional(),
  /** 是否打断当前正在播报的内容（用户抢话时为 true） */
  interrupt: z.boolean().optional().default(false),
});

/** 数字人面试官的 system prompt */
const AVATAR_INTERVIEW_PROMPT = `你是一个专业的程序员面试官，擅长前端技术栈，包括 HTML、CSS、JavaScript、TypeScript、React、Vue、Node.js、小程序等技术。

你正在通过视频进行一对一的模拟面试。请注意以下要求：

1. 你的回复会直接由数字人播报，所以要口语化、自然、简洁
2. 不要使用 Markdown 格式、代码块、表格等文字格式
3. 每次回复控制在 3-5 句话以内
4. 说话要像真实面试官一样，有亲和力但专业
5. 不要在回复中出现括号说明、表情符号等非语音内容

模拟面试流程：
- 先让候选人自我介绍
- 询问离职原因（如果不是应届生）
- 出 2-3 道技术题（JS 基础、算法、场景设计）
- 询问项目经历和挑战
- 最后给出综合点评

每道题候选人回答后，给出简短点评，然后继续下一题。
全程最多 8-10 个问题，之后引导结束面试。`;

const SENTENCE_SPLIT_RE = /(?<=[\u3002\uff01\uff1f\uff1b\n])/;

/**
 * 按句子分割文本
 * 对于数字人播报，需要逐句发送以实现更自然的播报节奏
 */
function splitBySentence(text: string): string[] {
  // 按中文标点和英文标点分割
  const sentences = text.split(SENTENCE_SPLIT_RE);
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = requestSchema.parse(json);

    // 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 构建对话历史
    const systemPrompt = body.resumeContext
      ? `${AVATAR_INTERVIEW_PROMPT}\n\n${body.resumeContext}`
      : AVATAR_INTERVIEW_PROMPT;

    const llmMessages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      ...body.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user", content: body.userText },
    ];

    // 调用 LLM 生成回复
    const { text: replyText } = await generateText({
      model: myProvider.languageModel("chat-model"),
      messages: llmMessages,
    });

    // 逐句发送给数字人播报
    const sentences = splitBySentence(replyText);
    for (let i = 0; i < sentences.length; i++) {
      // 第一句使用 interrupt 标志（打断当前正在播报的内容）
      await sendAvatarText(
        body.sessionId,
        sentences[i],
        i === 0 && body.interrupt
      );
    }

    return Response.json({ replyText });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("数字人播报失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
