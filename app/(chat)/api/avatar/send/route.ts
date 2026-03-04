/**
 * 数字人播报文本 API
 *
 * POST /api/avatar/send
 *
 * 工作流程：
 * 1. 接收用户文本和当前对话上下文
 * 2. 委托给 avatar-agent 处理 LLM 对话和播报
 * 3. 返回完整回复文本给前端显示
 *
 * 注意：Agent 逻辑已提取到 lib/ai/agent/avatar-agent.ts
 * 本路由只负责 HTTP 请求处理和鉴权
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createAvatarResponse } from "@/lib/ai/agent/avatar-agent";
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

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = requestSchema.parse(json);

    // 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 委托给 Avatar Agent 处理对话和播报
    const replyText = await createAvatarResponse({
      sessionId: body.sessionId,
      userText: body.userText,
      messages: body.messages,
      resumeContext: body.resumeContext,
      interrupt: body.interrupt,
    });

    return Response.json({ replyText });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("数字人播报失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
