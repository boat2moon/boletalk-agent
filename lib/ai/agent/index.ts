/**
 * Agent 主入口模块
 *
 * 这是整个 Agent 工作流的核心调度器。
 * 工作流程：
 * 1. 先调用 classifyMessages 对用户消息进行意图分类
 * 2. 根据分类结果，分发到不同的专用 agent：
 *    - resume_opt → 简历优化 agent
 *    - mock_interview → 模拟面试 agent
 *    - 其他 → 默认的通用 agent
 * 3. 将 agent 生成的 stream 合并到 UI 消息流中返回给前端
 *
 * 这种"分类 → 分发"的模式是典型的顺序工作流（Sequential Workflow）
 */

import { createUIMessageStream } from "ai";
import type { Session } from "next-auth";
import { classifyMessages } from "@/lib/ai/agent/classify";
import { createDefaultStream } from "@/lib/ai/agent/common";
import { createMockInterviewStream } from "@/lib/ai/agent/mock-interview";
import { createResumeOptStream } from "@/lib/ai/agent/resume-opt";
import type { ChatModel } from "@/lib/ai/models";
import type { RequestHints } from "@/lib/ai/prompts";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { generateUUID } from "@/lib/utils";

export type CreateChatStreamOptions = {
  messages: ChatMessage[];
  selectedChatModel: ChatModel["id"];
  requestHints: RequestHints;
  session: Session;
  /** 外层回调：stream 完成后保存消息和 usage */
  onFinish?: (params: { messages: ChatMessage[]; usage?: AppUsage }) => void;
};

/**
 * 创建聊天 stream —— Agent 工作流的入口函数
 *
 * 被 route.ts 调用，返回一个 UI 消息流。
 * 内部实现了"分类 → 分发"的工作流：
 *
 * ```
 * 用户消息 → classifyMessages(分类) → 根据结果选择 agent → 返回 stream
 *                                        ├─ resume_opt → createResumeOptStream
 *                                        ├─ mock_interview → createMockInterviewStream
 *                                        └─ others → createDefaultStream
 * ```
 */
export function createChatStream({
  messages,
  selectedChatModel,
  requestHints,
  session,
  onFinish,
}: CreateChatStreamOptions) {
  // 用于在 execute 和 onFinish 之间传递 usage 数据
  let finalMergedUsage: AppUsage | undefined;

  const stream = createUIMessageStream({
    // execute 是异步的，因为需要先分类再决定用哪个 agent
    execute: async ({ writer: dataStream }) => {
      // ========== 第一步：消息分类 ==========
      // 调用 classify agent，获取结构化的分类结果
      const classification = await classifyMessages(messages);
      // console.log("classification => ", classification);

      let result:
        | ReturnType<typeof createResumeOptStream>
        | ReturnType<typeof createMockInterviewStream>
        | ReturnType<typeof createDefaultStream>;

      // ========== 第二步：根据分类结果选择不同的 agent ==========
      if (classification.resume_opt) {
        // 简历优化 → 使用专门的简历优化 agent
        result = createResumeOptStream({
          messages,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      } else if (classification.mock_interview) {
        // 模拟面试 → 使用专门的模拟面试 agent
        result = createMockInterviewStream({
          messages,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      } else {
        // 其他情况 → 使用默认的通用 agent（原有的 streamText 逻辑）
        result = createDefaultStream({
          messages,
          selectedChatModel,
          requestHints,
          session,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      }

      // ========== 第三步：消费 stream 并合并到 UI 消息流 ==========
      result.consumeStream();

      dataStream.merge(
        result.toUIMessageStream({
          sendReasoning: true,
        })
      );
    },
    generateId: generateUUID,
    // stream 完成后的回调：将完成的消息和 usage 传递给外层（route.ts）保存
    onFinish: async ({ messages: finishedMessages }) => {
      if (onFinish) {
        await onFinish({
          messages: finishedMessages as ChatMessage[],
          usage: finalMergedUsage,
        });
      }
    },
    onError: () => {
      return "Oops, an error occurred!";
    },
  });

  return stream;
}
