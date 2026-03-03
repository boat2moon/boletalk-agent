/**
 * 停止数字人面试会话 API
 *
 * POST /api/avatar/stop
 *
 * 调用 StopInstance 释放数字人流媒体资源。
 * ⚠️ 必须在面试结束后调用，否则实例会持续计费。
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { powerOffInstance, stopAvatarInstance } from "@/lib/ai/avatar-client";
import { ChatSDKError } from "@/lib/errors";

const requestSchema = z.object({
  /** 数字人 session ID */
  sessionId: z.string(),
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

    // 1. 停止数字人播报会话（释放推流资源）
    await stopAvatarInstance(body.sessionId);

    // 2. 关机停复机（停止 GPU 计费）
    // 停止推流不等于关机，不关机 GPU 会持续计费
    powerOffInstance().catch((err) => {
      console.warn("[Avatar] 停复机关机失败（不影响用户体验）:", err);
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("停止数字人失败:", error);
    // 即使停止失败也返回 200，前端不需要重试
    return Response.json({ success: false, error: "停止数字人失败" });
  }
}
