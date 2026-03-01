/**
 * Agent 公共模块
 *
 * 包含各 agent 共用的逻辑：
 * 1. createUsageFinishHandler - 处理 TokenLens enrichment 和 usage 更新的公共函数
 * 2. createDefaultStream - 默认的 streamText 调用逻辑（用于编程/面试相关的普通问答）
 */

import {
  convertToModelMessages,
  type LanguageModelUsage,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import type { Session } from "next-auth";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import type { ChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
// Tools 已注释，保留 import 注释以备后续开启
// import { createDocument } from "@/lib/ai/tools/create-document";
// import { getWeather } from "@/lib/ai/tools/get-weather";
// import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
// import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";

/**
 * 缓存 TokenLens 模型目录
 * 用于获取模型定价信息以计算 token 费用
 * 缓存 24 小时避免频繁请求
 */
const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

// ==================== 公共 Usage 处理函数 ====================

export type CreateUsageFinishHandlerOptions = {
  /** 模型 ID，用于 TokenLens 费用计算 */
  modelId: string | undefined;
  /** 数据流写入器，用于将 usage 数据推送到前端 */
  dataStream: UIMessageStreamWriter<ChatMessage>;
  /** 可选回调，当 usage 计算完成后通知外层更新 */
  onUsageUpdate?: (usage: AppUsage) => void;
};

/**
 * 创建 usage finish 处理函数
 *
 * 这是一个公共函数，可以在不同的 agent stream 中复用。
 * 处理流程：
 * 1. 尝试获取 TokenLens 目录
 * 2. 用模型 ID + 原始 usage 计算费用
 * 3. 将最终 usage 写入 dataStream 推送给前端
 * 4. 如果有 onUsageUpdate 回调则调用它
 *
 * @returns 一个 onFinish 回调函数，签名为 ({usage}) => Promise<void>
 */
export function createUsageFinishHandler({
  modelId,
  dataStream,
  onUsageUpdate,
}: CreateUsageFinishHandlerOptions) {
  return async ({ usage }: { usage: LanguageModelUsage }) => {
    try {
      const providers = await getTokenlensCatalog();
      // 如果没有 modelId，直接返回原始 usage
      if (!modelId) {
        const finalMergedUsage = usage;
        dataStream.write({
          type: "data-usage",
          data: finalMergedUsage,
        });
        if (onUsageUpdate) {
          onUsageUpdate(finalMergedUsage);
        }
        return;
      }

      // 如果 TokenLens 目录获取失败，返回原始 usage
      if (!providers) {
        const finalMergedUsage = usage;
        dataStream.write({
          type: "data-usage",
          data: finalMergedUsage,
        });
        if (onUsageUpdate) {
          onUsageUpdate(finalMergedUsage);
        }
        return;
      }

      // 使用 TokenLens 计算费用并合并到 usage
      const summary = getUsage({ modelId, usage, providers });
      const finalMergedUsage = {
        ...usage,
        ...summary,
        modelId,
      } as AppUsage;
      dataStream.write({ type: "data-usage", data: finalMergedUsage });
      if (onUsageUpdate) {
        onUsageUpdate(finalMergedUsage);
      }
    } catch (err) {
      console.warn("TokenLens enrichment failed", err);
      const finalMergedUsage = usage;
      dataStream.write({ type: "data-usage", data: finalMergedUsage });
      if (onUsageUpdate) {
        onUsageUpdate(finalMergedUsage);
      }
    }
  };
}

// ==================== 默认 Stream 创建函数 ====================

export type CreateDefaultStreamOptions = {
  messages: ChatMessage[];
  selectedChatModel: ChatModel["id"];
  requestHints: RequestHints;
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  /** 可选回调，usage 计算完成时通知外层 */
  onUsageUpdate?: (usage: AppUsage) => void;
};

/**
 * 创建默认的 stream（用于普通问答场景）
 *
 * 当消息不属于简历优化和模拟面试时，使用此函数处理。
 * 使用项目原有的 systemPrompt 和工具配置。
 *
 * 注意：原有的 getWeather/createDocument 等工具已注释掉，
 * 因为在当前项目中暂不需要这些工具。
 */
export function createDefaultStream({
  messages,
  selectedChatModel,
  requestHints,
  session,
  dataStream,
  onUsageUpdate,
}: CreateDefaultStreamOptions) {
  return streamText({
    model: myProvider.languageModel(selectedChatModel),
    system: systemPrompt({ selectedChatModel, requestHints }),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    experimental_activeTools:
      selectedChatModel === "chat-model-reasoning"
        ? []
        : [
            // "getWeather",
            // "createDocument",
            // "updateDocument",
            // "requestSuggestions",
          ],
    experimental_transform: smoothStream({ chunking: "word" }),
    tools: {
      // getWeather,
      // createDocument: createDocument({ session, dataStream }),
      // updateDocument: updateDocument({ session, dataStream }),
      // requestSuggestions: requestSuggestions({
      //   session,
      //   dataStream,
      // }),
    },
    experimental_telemetry: {
      isEnabled: isProductionEnvironment,
      functionId: "stream-text",
    },
    onFinish: createUsageFinishHandler({
      modelId: myProvider.languageModel(selectedChatModel).modelId,
      dataStream,
      onUsageUpdate,
    }),
  });
}
