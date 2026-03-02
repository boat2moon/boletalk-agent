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
 * 4. 如果 voiceMode=true，LLM 完成后服务端分段调 TTS，音频通过 dataStream 推送
 */

import { createUIMessageStream } from "ai";
import type { Session } from "next-auth";
import { classifyMessages } from "@/lib/ai/agent/classify";
import { createDefaultStream } from "@/lib/ai/agent/common";
import { createMockInterviewStream } from "@/lib/ai/agent/mock-interview";
import { createResumeOptStream } from "@/lib/ai/agent/resume-opt";
import type { ChatModel } from "@/lib/ai/models";
import type { RequestHints } from "@/lib/ai/prompts";
import { synthesizeSpeech } from "@/lib/ai/tts";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { generateUUID } from "@/lib/utils";

export type CreateChatStreamOptions = {
  messages: ChatMessage[];
  selectedChatModel: ChatModel["id"];
  requestHints: RequestHints;
  session: Session;
  /** 是否为语音模式（为 true 时服务端会做 TTS 并推送音频） */
  voiceMode?: boolean;
  /** 新建会话时 AI 生成的标题，会在流开始时推送给前端 */
  chatTitle?: string;
  /** 外层回调：stream 完成后保存消息和 usage */
  onFinish?: (params: { messages: ChatMessage[]; usage?: AppUsage }) => void;
};

export function createChatStream({
  messages,
  selectedChatModel,
  requestHints,
  session,
  voiceMode,
  chatTitle,
  onFinish,
}: CreateChatStreamOptions) {
  let finalMergedUsage: AppUsage | undefined;

  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      // 新建会话时，先推送标题给前端以便乐观更新侧边栏
      if (chatTitle) {
        dataStream.write({
          type: "data-chat-title",
          data: chatTitle,
        });
      }

      const classification = await classifyMessages(messages);

      let result:
        | ReturnType<typeof createResumeOptStream>
        | ReturnType<typeof createMockInterviewStream>
        | ReturnType<typeof createDefaultStream>;

      if (classification.resume_opt) {
        result = createResumeOptStream({
          messages,
          voiceMode,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      } else if (classification.mock_interview) {
        result = createMockInterviewStream({
          messages,
          voiceMode,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      } else {
        result = createDefaultStream({
          messages,
          selectedChatModel,
          requestHints,
          session,
          voiceMode,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      }

      result.consumeStream();

      const uiStream = result.toUIMessageStream({
        sendReasoning: true,
      });

      if (voiceMode) {
        // ========== 语音模式：延迟文本流直到第一段 TTS 首包准备完毕 ==========
        let delayedController!: ReadableStreamDefaultController<any>;
        const delayedStream = new ReadableStream({
          start(controller) {
            delayedController = controller;
          },
        });

        dataStream.merge(delayedStream);

        let isFirstTtsReady = false;
        let textBuffer: any[] = [];

        // 独立异步读取文本流（防阻断 LLM 生成）
        const pipeProcess = async () => {
          const reader = uiStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (!isFirstTtsReady) {
                  isFirstTtsReady = true;
                  for (const c of textBuffer) {
                    delayedController.enqueue(c);
                  }
                  textBuffer = [];
                }
                delayedController.close();
                break;
              }

              if (isFirstTtsReady) {
                delayedController.enqueue(value);
              } else {
                textBuffer.push(value);
              }
            }
          } catch (error) {
            delayedController.error(error);
          }
        };
        pipeProcess();

        // 实时边检边 TTS
        // biome-ignore lint/performance/useTopLevelRegex: regex used inside stream callback
        const SENTENCE_END = /[。！？!?.\n]/;
        const MIN_CHUNK_SIZE = 200;
        let accumulated = "";

        for await (const delta of result.textStream) {
          accumulated += delta;

          let shouldTriggerTTS = false;
          let chunkToPlay = "";

          // 1. 找最后一个句子边界
          let lastBoundary = -1;
          for (let i = 0; i < accumulated.length; i++) {
            if (SENTENCE_END.test(accumulated[i])) {
              lastBoundary = i;
            }
          }

          if (lastBoundary >= 0) {
            // 有边界，不管多长都切掉
            chunkToPlay = accumulated.slice(0, lastBoundary + 1).trim();
            accumulated = accumulated.slice(lastBoundary + 1);
            shouldTriggerTTS = true;
          } else if (accumulated.length >= MIN_CHUNK_SIZE) {
            // 2. 超长无边界，强制切断
            chunkToPlay = accumulated.trim();
            accumulated = "";
            shouldTriggerTTS = true;
          }

          if (shouldTriggerTTS && chunkToPlay) {
            const ttsResult = await synthesizeSpeech(chunkToPlay);
            if (ttsResult) {
              // 推送第一段语音给前端
              dataStream.write({
                type: "data-ttsAudio",
                data: ttsResult,
              });

              // 然后再放行文本流（解决不同步感）
              if (!isFirstTtsReady) {
                isFirstTtsReady = true;
                for (const c of textBuffer) {
                  delayedController.enqueue(c);
                }
                textBuffer = [];
              }
            }
          }
        }

        // LLM 输出结束，处理剩余文本
        if (accumulated.trim()) {
          const ttsResult = await synthesizeSpeech(accumulated.trim());
          if (ttsResult) {
            dataStream.write({
              type: "data-ttsAudio",
              data: ttsResult,
            });

            if (!isFirstTtsReady) {
              isFirstTtsReady = true;
              for (const c of textBuffer) {
                delayedController.enqueue(c);
              }
              textBuffer = [];
            }
          }
        }

        // 兜底放行
        if (!isFirstTtsReady) {
          isFirstTtsReady = true;
          for (const c of textBuffer) {
            delayedController.enqueue(c);
          }
          textBuffer = [];
        }
      } else {
        dataStream.merge(uiStream);
      }
    },
    generateId: generateUUID,
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
