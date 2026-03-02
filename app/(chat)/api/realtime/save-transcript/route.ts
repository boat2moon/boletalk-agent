/**
 * 保存实时面试记录 API
 *
 * POST /api/realtime/save-transcript
 *
 * 面试结束后，前端将 transcript（对话记录）发回服务端保存。
 * 同时可以生成面试总结报告。
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { saveChat, saveMessages } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

const transcriptEntrySchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  timestamp: z.number(),
});

const requestSchema = z.object({
  /** 会话 ID */
  chatId: z.string(),
  /** 面试记录 */
  transcript: z.array(transcriptEntrySchema),
  /** 面试时长（毫秒） */
  duration: z.number(),
  /** 使用的模型 ID */
  model: z.string(),
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

    // 保存聊天记录（创建 chat 条目 + 消息记录）
    const chatId = body.chatId;

    // 创建 chat 条目
    const now = new Date();
    const title = `${now.getMonth() + 1}月${now.getDate()}日电话面试（${Math.round(body.duration / 60_000)}分钟）`;
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title,
      visibility: "private",
      chatType: "realtime",
    });

    // 将 transcript 转换为消息格式保存
    if (body.transcript.length > 0) {
      const messages = body.transcript.map((entry) => ({
        id: generateUUID(),
        chatId,
        role: entry.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: entry.text }],
        attachments: [],
        createdAt: new Date(entry.timestamp),
      }));

      await saveMessages({ messages });
    }

    return Response.json({
      success: true,
      chatId,
      messageCount: body.transcript.length,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("保存面试记录失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
