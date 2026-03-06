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
import {
  type EvaluationResult,
  generateEvaluation,
} from "@/lib/ai/agent/evaluate";
import { createMockInterviewStream } from "@/lib/ai/agent/mock-interview";
import { createResumeOptStream } from "@/lib/ai/agent/resume-opt";
import { streamTTSFromLLM as streamTTSFromAli } from "@/lib/ai/ali-tts";
import { streamTTSFromLLM as streamTTSFromDoubao } from "@/lib/ai/doubao-tts";
import type { ChatModel } from "@/lib/ai/models";
import type { RequestHints } from "@/lib/ai/prompts";
import { writeChatMemory } from "@/lib/ai/toolkit/memory";
import { stripMarkdown, synthesizeSpeech } from "@/lib/ai/tts";
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
  /** 显式意图标识（由前端按钮传入，如 'evaluate'） */
  intent?: string;
  /** 职位 JD 上下文（可选，由 buildJobContext 生成） */
  jobContext?: string;
  /** 会话 ID（用于记忆写入的 source 标识） */
  chatId: string;
  /** 外层回调：stream 完成后保存消息和 usage */
  onFinish?: (params: { messages: ChatMessage[]; usage?: AppUsage }) => void;
  /** 评估完成回调：将结果写入 DB */
  onEvaluationComplete?: (result: EvaluationResult) => Promise<void>;
};

export function createChatStream({
  messages,
  selectedChatModel,
  requestHints,
  session,
  voiceMode,
  chatTitle,
  intent,
  jobContext,
  chatId,
  onFinish,
  onEvaluationComplete,
}: CreateChatStreamOptions) {
  let finalMergedUsage: AppUsage | undefined;
  const userId = session.user?.id ?? "";

  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      const t0 = Date.now();
      console.log("[⏱ TIMING] stream execute start");

      // 新建会话时，先推送标题给前端以便乐观更新侧边栏
      if (chatTitle) {
        dataStream.write({
          type: "data-chat-title",
          data: chatTitle,
        });
      }

      console.log(`[⏱ TIMING] classify start +${Date.now() - t0}ms`);
      const classification = await classifyMessages(messages, intent);
      console.log(
        `[⏱ TIMING] classify done  +${Date.now() - t0}ms`,
        classification
      );

      // ── 评估分支：generateObject 生成结构化结果，不走 TTS ──
      if (classification.evaluate) {
        console.log(`[⏱ TIMING] evaluate start +${Date.now() - t0}ms`);
        try {
          const evaluationResult = await generateEvaluation(messages);
          console.log(`[⏱ TIMING] evaluate done  +${Date.now() - t0}ms`);

          // 将评估结果推送给前端
          dataStream.write({
            type: "data-evaluation",
            data: evaluationResult,
          });

          // 回调外层写入 DB
          if (onEvaluationComplete) {
            await onEvaluationComplete(evaluationResult);
          }

          // 后台异步写入记忆（fire-and-forget，不阻塞评估返回）
          // 写入完整会话文本 + 评估结果
          if (userId && chatId) {
            writeChatMemory({
              userId,
              chatId,
              messages,
              evaluationResult,
            }).catch((err) =>
              console.error("[agent] Memory write failed (non-blocking):", err)
            );
          }
        } catch (error) {
          console.error("[agent] Evaluation failed:", error);
          dataStream.write({
            type: "data-evaluationError",
            data: "评估生成失败，请稍后重试。",
          });
        }
        return; // 评估分支不走后续的 streamText + TTS 流程
      }

      // ── 正常对话分支：streamText ──
      let result:
        | ReturnType<typeof createResumeOptStream>
        | ReturnType<typeof createMockInterviewStream>
        | ReturnType<typeof createDefaultStream>;

      if (classification.resume_opt) {
        result = createResumeOptStream({
          messages,
          selectedChatModel,
          voiceMode,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      } else if (classification.mock_interview) {
        result = createMockInterviewStream({
          messages,
          selectedChatModel,
          voiceMode,
          jobContext,
          userId,
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
          jobContext,
          userId,
          dataStream,
          onUsageUpdate: (usage) => {
            finalMergedUsage = usage;
          },
        });
      }

      result.consumeStream();

      console.log(`[⏱ TIMING] streamText created +${Date.now() - t0}ms`);

      // 监听首token和流结束
      let firstTokenLogged = false;
      const uiStream = result
        .toUIMessageStream({
          sendReasoning: true,
        })
        .pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              if (!firstTokenLogged) {
                firstTokenLogged = true;
                console.log(`[⏱ TIMING] first token    +${Date.now() - t0}ms`);
              }
              controller.enqueue(chunk);
            },
            flush() {
              console.log(`[⏱ TIMING] stream done    +${Date.now() - t0}ms`);
            },
          })
        );

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

        // 首包音频就绪后放行文本流的辅助函数
        const releaseTextBuffer = () => {
          if (!isFirstTtsReady) {
            isFirstTtsReady = true;
            for (const c of textBuffer) {
              delayedController.enqueue(c);
            }
            textBuffer = [];
          }
        };

        // ================================================================
        //  长连接 TTS 级联：从 textStream 实时拆句，一个连接持续灌入
        //  只消费一次 textStream，避免 getter 重复创建全量流副本
        //  连接级降级：整个连接失败才切换下一个 provider
        // ================================================================

        // biome-ignore lint/performance/useTopLevelRegex: regex used inside stream callback
        const SENTENCE_END = /[。！？!?.;\n]/;
        const MIN_CHUNK_SIZE = 400;

        // ── 1. 从 textStream 实时拆句，收集到 sentences 数组 ──
        const sentences: string[] = [];
        let sentencesDone = false;
        let sentenceNotify: (() => void) | null = null;
        const notifySentence = () => {
          sentenceNotify?.();
          sentenceNotify = null;
        };

        const sentenceProducer = (async () => {
          let accumulated = "";
          for await (const delta of result.textStream) {
            accumulated += delta;

            let lastBoundary = -1;
            for (let i = 0; i < accumulated.length; i++) {
              if (SENTENCE_END.test(accumulated[i])) {
                lastBoundary = i;
              }
            }

            if (lastBoundary >= 0) {
              const rawChunk = accumulated.slice(0, lastBoundary + 1).trim();
              accumulated = accumulated.slice(lastBoundary + 1);
              const chunk = stripMarkdown(rawChunk);
              if (chunk) {
                sentences.push(chunk);
                notifySentence();
              }
            } else if (accumulated.length >= MIN_CHUNK_SIZE) {
              const chunk = stripMarkdown(accumulated.trim());
              accumulated = "";
              if (chunk) {
                sentences.push(chunk);
                notifySentence();
              }
            }
          }
          // 剩余文本
          const remaining = stripMarkdown(accumulated.trim());
          if (remaining) {
            sentences.push(remaining);
            notifySentence();
          }
          sentencesDone = true;
          notifySentence();
          // 通知前端文本生成已完成（TTS 可能还在处理）
          dataStream.write({ type: "data-textDone", data: true });
        })();

        // ── 2. 创建句子流迭代器（从 startIdx 开始，实时等待新句子）──
        function createSentenceStream(startIdx = 0): AsyncIterable<string> {
          let idx = startIdx;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<string>> {
                  // 等待直到有新句子可用或全部完成
                  while (idx >= sentences.length && !sentencesDone) {
                    await new Promise<void>((r) => {
                      sentenceNotify = r;
                    });
                  }
                  if (idx < sentences.length) {
                    return { value: sentences[idx++], done: false };
                  }
                  return { value: undefined as any, done: true };
                },
              };
            },
          };
        }

        // ── 3. 连接级 TTS 级联 ──
        type TTSProvider = "doubao" | "ali" | "minimax";
        let finalProvider: TTSProvider = "doubao";
        const degraded: string[] = [];
        let gotAudio = false;

        // 第1级：豆包 — 一个长 WebSocket 连接，持续灌入句子
        try {
          for await (const audioChunk of streamTTSFromDoubao(
            createSentenceStream(0)
          )) {
            dataStream.write({ type: "data-ttsAudio", data: audioChunk });
            releaseTextBuffer();
            gotAudio = true;
          }
          if (gotAudio) {
            finalProvider = "doubao";
          } else {
            // WebSocket 连接成功但未产出任何音频，记录降级
            console.warn("[agent] Doubao TTS produced no audio");
            degraded.push("doubao-tts");
          }
        } catch (doubaoError) {
          console.warn("[agent] Doubao TTS connection failed:", doubaoError);
          degraded.push("doubao-tts");
        }

        // 第2级：阿里云 CosyVoice — 如果豆包完全没产出音频，从头开始
        if (!gotAudio) {
          try {
            // 等待所有句子收集完毕（因为要为 Ali 创建新的迭代器）
            await sentenceProducer;
            for await (const audioChunk of streamTTSFromAli(
              createSentenceStream(0)
            )) {
              dataStream.write({ type: "data-ttsAudio", data: audioChunk });
              releaseTextBuffer();
              gotAudio = true;
            }
            if (gotAudio) {
              finalProvider = "ali";
            } else {
              console.warn("[agent] CosyVoice TTS produced no audio");
              degraded.push("ali-tts");
            }
          } catch (aliError) {
            console.warn("[agent] CosyVoice TTS connection failed:", aliError);
            degraded.push("ali-tts");
          }
        }

        // 第3级：MiniMax 逐句非流式兜底（所有流式 TTS 都失败时）
        // 注意：sentences 已经过 stripMarkdown 清洗
        if (!gotAudio) {
          await sentenceProducer; // 确保所有句子已收集
          for (const sentence of sentences) {
            const ttsResult = await synthesizeSpeech(sentence);
            if (ttsResult) {
              dataStream.write({ type: "data-ttsAudio", data: ttsResult });
              releaseTextBuffer();
              gotAudio = true;
            }
          }
          finalProvider = "minimax";
        }

        // 上报实际使用的 TTS 提供商
        dataStream.write({
          type: "data-ttsProvider",
          data: { provider: finalProvider, degraded },
        });

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
