/**
 * Agent 公共模块
 *
 * 包含默认的 streamText 调用逻辑（用于编程/面试相关的普通问答）。
 *
 * 注意：createUsageFinishHandler 已迁移到 lib/ai/toolkit/usage.ts
 * 本文件只负责 createDefaultStream 的实现。
 */

import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import type { Session } from "next-auth";
import type { ChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { createUsageFinishHandler } from "@/lib/ai/toolkit/usage";
import { fetchUrlTool } from "@/lib/ai/tools/fetch-url";
import { githubAnalysisTool } from "@/lib/ai/tools/github-analysis";
import { createMemoryReadTool } from "@/lib/ai/tools/memory-read";
import { ragSearchTool } from "@/lib/ai/tools/rag-search";
import { webSearchTool } from "@/lib/ai/tools/web-search";
// Tools 已注释，保留 import 注释以备后续开启
// import { createDocument } from "@/lib/ai/tools/create-document";
// import { getWeather } from "@/lib/ai/tools/get-weather";
// import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
// import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";

// ==================== 默认 Stream 创建函数 ====================

export type CreateDefaultStreamOptions = {
  messages: ChatMessage[];
  selectedChatModel: ChatModel["id"];
  requestHints: RequestHints;
  session: Session;
  voiceMode?: boolean;
  /** 职位 JD 上下文（可选） */
  jobContext?: string;
  /** 当前用户 ID（用于 per-user 记忆检索） */
  userId: string;
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
 * RAG 工具：ragSearch — LLM 自主决定是否需要检索知识库。
 */
export function createDefaultStream({
  messages,
  selectedChatModel,
  requestHints,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: kept for future use when tools are re-enabled
  session,
  voiceMode,
  jobContext,
  userId,
  dataStream,
  onUsageUpdate,
}: CreateDefaultStreamOptions) {
  return streamText({
    model: myProvider.languageModel(selectedChatModel),
    system: systemPrompt({
      selectedChatModel,
      requestHints,
      voiceMode,
      jobContext,
    }),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    experimental_activeTools:
      selectedChatModel === "chat-model-reasoning"
        ? []
        : [
            "ragSearch",
            "memoryRead",
            "githubAnalysis",
            "webSearch",
            "fetchUrl",
            // "getWeather",
            // "createDocument",
            // "updateDocument",
            // "requestSuggestions",
          ],
    experimental_transform: smoothStream({ chunking: "word" }),
    tools: {
      ragSearch: ragSearchTool,
      memoryRead: createMemoryReadTool(userId),
      githubAnalysis: githubAnalysisTool,
      webSearch: webSearchTool,
      fetchUrl: fetchUrlTool,
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
