/**
 * 保存视频面试记录 API
 *
 * POST /api/avatar/save-transcript
 *
 * 面试结束后，前端将对话记录发回服务端持久化。
 * 复用和电话面试 (realtime) 相同的保存模式。
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { saveMessages, updateChatTitleById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
});

const requestSchema = z.object({
  /** 会话 ID */
  chatId: z.string(),
  /** 对话记录 */
  messages: z.array(messageSchema),
  /** 面试时长（秒） */
  duration: z.number(),
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

    const chatId = body.chatId;

    // 查更新 chat 记录，设置最终的标题
    const now = new Date();
    const totalSeconds = Math.round(body.duration);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const title = `${now.getMonth() + 1}月${now.getDate()}日视频面试（${mins}分${secs}秒）`;
    await updateChatTitleById({
      chatId,
      title,
    });

    // 将 messages 转换为标准消息格式保存
    if (body.messages.length > 0) {
      const dbMessages = body.messages.map((entry) => ({
        id: generateUUID(),
        chatId,
        role: entry.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: entry.content }],
        attachments: [],
        createdAt: new Date(entry.timestamp),
      }));

      await saveMessages({ messages: dbMessages });
    }

    return Response.json({
      success: true,
      chatId,
      messageCount: body.messages.length,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("保存视频面试记录失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
