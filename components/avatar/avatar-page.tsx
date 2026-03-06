"use client";

/**
 * 模式4 数字人面试 主页面组件
 *
 * 管理数字人面试的三个阶段：
 * 1. 准备阶段：上传简历（可选）+ 开始面试
 * 2. 会话阶段：数字人视频 + 文本对话
 * 3. 结束阶段：面试总结
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import {
  EvaluationCard,
  type EvaluationData,
  EvaluationLoading,
} from "@/components/evaluation-card";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/sidebar-history";
import { useVoiceMode } from "@/components/voice-mode-context";
import type { ResumeAnalysis } from "@/lib/ai/toolkit/resume-analyzer";
import { generateUUID } from "@/lib/utils";
import { AvatarPreparationView } from "./avatar-preparation-view";
import { AvatarSessionView } from "./avatar-session-view";

export type AvatarPhase = "preparation" | "session" | "summary";

export type AvatarMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type AvatarChannel = {
  channelId: string;
  token: string;
  expireTime: string;
  nonce: string;
  userId: string;
  appId: string;
  gslb: string[];
};

export function AvatarPage({
  hideHeader,
  onHasActiveChatChange,
}: {
  /** 由外层 ModeAwareContainer 统一渲染 ChatHeader 时为 true */
  hideHeader?: boolean;
  /** 通知父组件"是否有活跃会话"状态变化 */
  onHasActiveChatChange?: (hasActive: boolean) => void;
}) {
  const [phase, setPhase] = useState<AvatarPhase>("preparation");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [channel, setChannel] = useState<AvatarChannel | null>(null);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(
    null
  );
  const [messages, setMessages] = useState<AvatarMessage[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  /** 前端展示的启动进度文案 */
  const [bootStatus, setBootStatus] = useState<string>("");
  const chatIdRef = useRef(generateUUID());
  const [selectedJobTemplate, setSelectedJobTemplate] = useState<
    string | undefined
  >();
  const [jobContext, setJobContext] = useState<string | undefined>();
  const { mutate } = useSWRConfig();
  const { setSessionActive, setRequestEndSession } = useVoiceMode();
  /** AvatarSessionView 暴露的结束面试函数 ref */
  const endCallTriggerRef = useRef<(() => void) | null>(null);

  /**
   * 开始面试：两阶段流程
   *
   * Phase 1: 检查/触发 GPU 实例开机 + 轮询等待
   * Phase 2: 调用 /api/avatar/start 启动数字人会话
   */
  const handleStartInterview = useCallback(
    async (resumeText?: string) => {
      try {
        // ── Phase 1: 确保 GPU 实例开机 ──
        setBootStatus("正在检查数字人服务状态...");

        // 查询当前电源状态
        const statusRes = await fetch("/api/avatar/power");
        const statusData = await statusRes.json();
        let powerStatus: number = statusData.status;

        // 如果未开机，触发开机
        if (powerStatus !== 10) {
          setBootStatus("数字人服务未就绪，正在启动...");
          await fetch("/api/avatar/power", { method: "POST" });

          // 轮询等待开机完成（每 3 秒查一次，最多 5 分钟）
          const startTime = Date.now();
          const MAX_WAIT = 5 * 60 * 1000;

          while (powerStatus !== 10) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setBootStatus(
              `数字人服务正在启动中，请耐心等待（已等待 ${elapsed} 秒，通常需要 1~3 分钟）...`
            );

            if (Date.now() - startTime > MAX_WAIT) {
              throw new Error(
                "数字人服务启动超时（已等待超过 5 分钟），请稍后重试"
              );
            }

            await new Promise((r) => setTimeout(r, 3000));

            const pollRes = await fetch("/api/avatar/power");
            const pollData = await pollRes.json();
            powerStatus = pollData.status;
          }
        }

        // ── Phase 2: 启动数字人会话 ──
        setBootStatus("数字人服务已就绪，正在创建面试会话...");

        const res = await fetch("/api/avatar/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatIdRef.current,
            resumeText,
            selectedJobTemplate,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `请求失败 (${res.status})`);
        }

        const data = await res.json();

        if (data.resumeAnalysis) {
          setResumeAnalysis(data.resumeAnalysis);
        }
        if (data.jobContext) {
          setJobContext(data.jobContext);
        }

        setBootStatus("");
        setSessionId(data.sessionId);
        setChannel(data.channel);

        // 乐观插入侧边栏会话列表
        const skeletonChat = {
          id: chatIdRef.current,
          title: "数字人模拟面试",
          createdAt: new Date(),
          userId: "",
          visibility: "private" as const,
          chatType: "avatar",
          lastContext: null,
        };
        const key = unstable_serialize(getChatHistoryPaginationKey);
        mutate(
          key,
          (currentData: ChatHistory[] | undefined) => {
            if (!currentData || currentData.length === 0) {
              return [
                { chats: [skeletonChat], hasMore: false },
              ] as ChatHistory[];
            }
            return [
              {
                ...currentData[0],
                chats: [skeletonChat, ...currentData[0].chats],
              },
              ...currentData.slice(1),
            ] as ChatHistory[];
          },
          { revalidate: false }
        );
        window.history.pushState({}, "", `/chat/${chatIdRef.current}`);

        setPhase("session");
      } catch (error) {
        setBootStatus("");
        toast.error(
          error instanceof Error ? error.message : "启动数字人面试失败"
        );
      }
    },
    [mutate, selectedJobTemplate]
  );

  /**
   * 面试结束
   */
  const handleSessionEnd = useCallback(
    async (finalMessages: AvatarMessage[], duration: number) => {
      setMessages(finalMessages);
      setSessionDuration(duration);
      setPhase("summary");

      // 停止数字人实例
      if (sessionId) {
        try {
          await fetch("/api/avatar/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
        } catch (err) {
          console.warn("停止数字人实例失败:", err);
        }
      }

      // 保存面试记录到数据库（带重试）
      const MAX_SAVE_RETRIES = 2;
      let saved = false;
      for (let attempt = 0; attempt <= MAX_SAVE_RETRIES; attempt++) {
        try {
          await fetch("/api/avatar/save-transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: chatIdRef.current,
              messages: finalMessages,
              duration,
            }),
          });
          saved = true;
          break;
        } catch (err) {
          console.warn(
            `保存视频面试记录失败 (${attempt + 1}/${MAX_SAVE_RETRIES + 1}):`,
            err
          );
          if (attempt < MAX_SAVE_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
      }
      if (saved) {
        // 触发侧边栏 revalidate，同步后端保存的真实标题（含时长）
        mutate(unstable_serialize(getChatHistoryPaginationKey));
      } else {
        toast.error("面试记录保存失败，请手动截图保留对话内容");
      }
    },
    [sessionId, mutate]
  );

  // 通知父组件"是否有活跃会话"的状态变化
  useEffect(() => {
    onHasActiveChatChange?.(phase !== "preparation");
  }, [phase, onHasActiveChatChange]);

  // 注册/注销 session active 状态和挂断回调
  useEffect(() => {
    const isActive = phase === "session";
    setSessionActive(isActive);

    if (isActive) {
      setRequestEndSession(() => {
        return new Promise<void>((resolve) => {
          endCallTriggerRef.current?.();
          resolve();
        });
      });
    } else {
      setRequestEndSession(null);
    }

    return () => {
      setSessionActive(false);
      setRequestEndSession(null);
    };
  }, [phase, setSessionActive, setRequestEndSession]);

  // 页面卸载时确保停止数字人实例
  useEffect(() => {
    const currentSessionId = sessionId;
    return () => {
      if (currentSessionId) {
        fetch("/api/avatar/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId }),
        }).catch(() => {
          /* fire-and-forget cleanup */
        });
      }
    };
  }, [sessionId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {!hideHeader && (
        <ChatHeader
          chatId={chatIdRef.current}
          hasActiveChat={phase !== "preparation"}
          isReadonly={false}
          selectedVisibilityType="private"
        />
      )}

      {phase === "preparation" && (
        <AvatarPreparationView
          bootStatus={bootStatus}
          onJobTemplateChange={setSelectedJobTemplate}
          onStart={handleStartInterview}
          selectedJobTemplate={selectedJobTemplate}
        />
      )}

      {phase === "session" && sessionId && channel && (
        <AvatarSessionView
          channel={channel}
          endCallTriggerRef={endCallTriggerRef}
          jobContext={jobContext}
          onEnd={handleSessionEnd}
          resumeAnalysis={resumeAnalysis}
          sessionId={sessionId}
        />
      )}

      {phase === "summary" && (
        <AvatarSummary
          chatId={chatIdRef.current}
          messages={messages}
          onNewInterview={() => {
            chatIdRef.current = generateUUID();
            setSessionId(null);
            setChannel(null);
            setMessages([]);
            setSessionDuration(0);
            setResumeAnalysis(null);
            setPhase("preparation");
          }}
          sessionDuration={sessionDuration}
        />
      )}
    </div>
  );
}

/**
 * Avatar 面试总结子组件
 *
 * 自动生成/加载面试评估，展示对话记录。
 */
function AvatarSummary({
  chatId,
  messages,
  sessionDuration,
  onNewInterview,
}: {
  chatId: string;
  messages: AvatarMessage[];
  sessionDuration: number;
  onNewInterview: () => void;
}) {
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(
    null
  );
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const fetchOrGenerateEvaluation = useCallback(async () => {
    setEvaluationLoading(true);
    try {
      const existing = await fetch(`/api/chat/evaluation?chatId=${chatId}`);
      if (existing.ok) {
        setEvaluationData(await existing.json());
        setEvaluationLoading(false);
        return;
      }
      if (existing.status === 404) {
        const res = await fetch("/api/chat/evaluation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
        if (res.ok) {
          setEvaluationData(await res.json());
        } else {
          const errData = await res.json().catch(() => null);
          setEvaluationError(errData?.error || "评估生成失败");
        }
      }
    } catch {
      setEvaluationError("网络错误，评估加载失败");
    } finally {
      setEvaluationLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    fetchOrGenerateEvaluation();
  }, [fetchOrGenerateEvaluation]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h2 className="font-bold text-2xl">面试结束</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            本次视频面试时长：{Math.floor(sessionDuration / 60)} 分{" "}
            {sessionDuration % 60} 秒
          </p>
        </div>

        {/* AI 面试评估 */}
        <div className="rounded-xl border p-4">
          <h3 className="mb-3 font-semibold text-sm">📊 面试评估</h3>
          {evaluationLoading ? (
            <EvaluationLoading />
          ) : evaluationError ? (
            <p className="text-destructive text-sm">{evaluationError}</p>
          ) : evaluationData ? (
            <EvaluationCard compact data={evaluationData} />
          ) : null}
        </div>

        {/* 对话记录 */}
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              className={`rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "ml-8 bg-primary/10 text-right"
                  : "mr-8 bg-muted"
              }`}
              key={`msg-${msg.timestamp}`}
            >
              <p className="mb-1 font-medium text-muted-foreground text-xs">
                {msg.role === "user" ? "你" : "面试官"}
              </p>
              <p className="text-sm">{msg.content}</p>
            </div>
          ))}
        </div>

        <div className="pb-6 text-center">
          <button
            className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
            onClick={onNewInterview}
            type="button"
          >
            开始新面试
          </button>
        </div>
      </div>
    </div>
  );
}
