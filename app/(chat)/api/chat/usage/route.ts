/**
 * 聊天使用次数查询 API
 *
 * GET /api/chat/usage
 * 返回当前用户 24 小时内的 API 调用次数和每日上限
 *
 * 响应格式：{ used: number, max: number }
 * - used: 已使用的次数
 * - max: 每日最大次数（guest: 10, regular: 30）
 */

import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { getChatApiCallCountByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    // 查询用户 24 小时内的 API 调用次数
    const used = await getChatApiCallCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    // 根据用户类型获取每日最大调用次数
    // @ts-expect-error
    const max = entitlementsByUserType[userType].maxChatApiCallsPerDay;

    return Response.json({ used, max });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Unhandled error in chat usage API:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
