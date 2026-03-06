/**
 * 用户权限配置
 *
 * 根据用户类型（guest/regular）定义不同的功能限制：
 * - maxMessagesPerDay: 每日最大消息数（原有逻辑）
 * - maxChatApiCallsPerDay: 每日最大 API 调用次数（新增）
 * - availableChatModelIds: 可用的 AI 模型列表
 */

import type { UserType } from "@/app/(auth)/auth";
import type { ChatModel } from "./models";

type Entitlements = {
  maxMessagesPerDay: number;
  /** 每日最大 API 调用次数 */
  maxChatApiCallsPerDay: number;
  availableChatModelIds: ChatModel["id"][];
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * 未注册的游客用户
   * API 调用次数较少（10次/天），鼓励注册
   */
  guest: {
    maxMessagesPerDay: 20,
    maxChatApiCallsPerDay: 10,
    availableChatModelIds: ["chat-model", "chat-model-glm"],
  },

  /*
   * 已注册的普通用户
   * API 调用次数更多（30次/天）
   */
  regular: {
    maxMessagesPerDay: 100,
    maxChatApiCallsPerDay: 30,
    availableChatModelIds: ["chat-model", "chat-model-glm"],
  },

  /*
   * VIP 用户
   * API 调用次数大幅提升（99次/天）
   */
  vip: {
    maxMessagesPerDay: 500,
    maxChatApiCallsPerDay: 99,
    availableChatModelIds: ["chat-model", "chat-model-glm"],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
