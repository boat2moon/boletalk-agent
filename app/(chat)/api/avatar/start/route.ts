/**
 * 启动数字人面试会话 API
 *
 * POST /api/avatar/start
 *
 * 工作流程：
 * 1. 验证用户身份和配额
 * 2. 如有简历文本，调用 resume-analyze Agent 分析
 * 3. 调用阿里云 StartInstance 启动数字人流媒体服务
 * 4. 返回 sessionId + RTC channel 信息给前端
 */

import { z } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import { startAvatarInstance } from "@/lib/ai/avatar-client";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  analyzeResume,
  type ResumeAnalysis,
} from "@/lib/ai/toolkit/resume-analyzer";
import {
  getChatApiCallCountByUserId,
  recordChatApiCall,
  saveChat,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const requestSchema = z.object({
  /** 由前端生成的会话 ID */
  chatId: z.string(),
  /** 简历文本（可选，前端解析 PDF 后以 base64 传入） */
  resumeText: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = requestSchema.parse(json);

    // 1. 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 2. 检查配额
    const userType: UserType = session.user.type;
    const apiCallCount = await getChatApiCallCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });
    const maxApiCalls = entitlementsByUserType[userType].maxChatApiCallsPerDay;

    if (apiCallCount >= maxApiCalls) {
      const errorMessage =
        userType === "guest"
          ? "您今天的使用次数已用完（10次/天）。请明天再试，或注册账号获得更多次数。"
          : "您今天的使用次数已用完（30次/天）。请明天再试。";
      return new ChatSDKError(
        "rate_limit:chat_api",
        undefined,
        errorMessage
      ).toResponse();
    }

    // 记录 API 调用
    await recordChatApiCall({ userId: session.user.id });

    // 3. 分析简历（如果提供了）
    let resumeAnalysis: ResumeAnalysis | null = null;

    if (body.resumeText && body.resumeText.trim().length > 50) {
      try {
        resumeAnalysis = await analyzeResume(body.resumeText);
      } catch (err) {
        console.warn("简历分析失败，继续启动数字人：", err);
      }
    }

    // 4. 启动数字人流媒体服务（前端已确保停复机开机）
    // 注意：这里的 sessionId 是阿里云 RTC / 播报特有的会话 ID，不是数据库的 chatId
    const { sessionId, channel } = await startAvatarInstance(session.user.id);

    // 5. 将会话记录先行持久化到数据库，支持前端 SWR revalidate（防止乐观 UI 消失）
    const now = new Date();
    await saveChat({
      id: body.chatId,
      userId: session.user.id,
      title: `${now.getMonth() + 1}月${now.getDate()}日视频面试（进行中...）`,
      visibility: "private",
      chatType: "avatar",
    });

    // 6. 返回连接信息
    return Response.json({
      sessionId,
      channel,
      resumeAnalysis,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("启动数字人会话失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
