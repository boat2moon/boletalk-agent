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
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/sidebar-history";
import type { ResumeAnalysis } from "@/lib/ai/agent/resume-analyze";
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
  const { mutate } = useSWRConfig();

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
          body: JSON.stringify({ resumeText }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `请求失败 (${res.status})`);
        }

        const data = await res.json();

        if (data.resumeAnalysis) {
          setResumeAnalysis(data.resumeAnalysis);
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
    [mutate]
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

      // 保存面试记录到数据库
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
      } catch (err) {
        console.warn("保存视频面试记录失败:", err);
      }
    },
    [sessionId]
  );

  // 通知父组件"是否有活跃会话"的状态变化
  useEffect(() => {
    onHasActiveChatChange?.(phase !== "preparation");
  }, [phase, onHasActiveChatChange]);

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
          onStart={handleStartInterview}
        />
      )}

      {phase === "session" && sessionId && channel && (
        <AvatarSessionView
          channel={channel}
          onEnd={handleSessionEnd}
          resumeAnalysis={resumeAnalysis}
          sessionId={sessionId}
        />
      )}

      {phase === "summary" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="text-center">
            <h2 className="font-bold text-2xl">面试结束</h2>
            <p className="mt-2 text-muted-foreground text-sm">
              本次视频面试时长：{Math.floor(sessionDuration / 60)} 分{" "}
              {sessionDuration % 60} 秒
            </p>
          </div>

          {/* 对话记录 */}
          <div className="w-full max-w-2xl space-y-3">
            {messages.map((msg, _i) => (
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

          <button
            className="mt-4 rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
            onClick={() => {
              chatIdRef.current = generateUUID();
              setSessionId(null);
              setChannel(null);
              setMessages([]);
              setSessionDuration(0);
              setResumeAnalysis(null);
              setPhase("preparation");
            }}
            type="button"
          >
            开始新面试
          </button>
        </div>
      )}
    </div>
  );
}
