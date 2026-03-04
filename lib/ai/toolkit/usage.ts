/**
 * 共享 Usage 处理模块
 *
 * 从 lib/ai/agent/common.ts 提取而来。
 * 提供 TokenLens 费用计算和 usage 数据推送功能，
 * 供所有子 Agent（resume-opt、mock-interview、common、avatar-agent）复用。
 */

import type { LanguageModelUsage, UIMessageStreamWriter } from "ai";
import { unstable_cache as cache } from "next/cache";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
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
