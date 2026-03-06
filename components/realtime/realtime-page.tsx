"use client";

/**
 * 模式3 主页面组件
 *
 * 管理高级语音模拟面试的三个阶段：
 * 1. 准备阶段：上传简历（可选）+ 选择模型 + 开始面试
 * 2. 通话阶段：实时语音面试（WebSocket 双向音频流）
 * 3. 结束阶段：展示面试记录和总结
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
import { useVoiceMode } from "@/components/voice-mode-context";
import { DEFAULT_REALTIME_MODEL } from "@/lib/ai/realtime-models";
import type { ResumeAnalysis } from "@/lib/ai/toolkit/resume-analyzer";
import { generateUUID } from "@/lib/utils";
import { CallView } from "./call-view";
import { InterviewSummary } from "./interview-summary";
import { PreparationView } from "./preparation-view";

export type RealtimePhase = "preparation" | "call" | "summary";

export type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  /** 标记该消息是否已确认（false = ASR 中间结果或流式碎片） */
  isFinal?: boolean;
};

export function RealtimePage({
  hideHeader,
  onHasActiveChatChange,
}: {
  /** 由外层 ModeAwareContainer 统一渲染 ChatHeader 时为 true */
  hideHeader?: boolean;
  /** 通知父组件“是否有活跃会话”状态变化 */
  onHasActiveChatChange?: (hasActive: boolean) => void;
}) {
  const [phase, setPhase] = useState<RealtimePhase>("preparation");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_REALTIME_MODEL);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(
    null
  );
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [selectedJobTemplate, setSelectedJobTemplate] = useState<
    string | undefined
  >();
  const chatIdRef = useRef(generateUUID());
  const { mutate } = useSWRConfig();
  const { setSessionActive, setRequestEndSession } = useVoiceMode();
  /** CallView 暴露的挂断函数 ref */
  const endCallTriggerRef = useRef<(() => void) | null>(null);

  /**
   * 开始面试
   *
   * 调用 /api/realtime/session 创建会话，获取 WebSocket 连接凭据
   */
  const handleStartInterview = useCallback(
    async (resumeText?: string) => {
      try {
        const res = await fetch("/api/realtime/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatIdRef.current,
            selectedModel,
            resumeText,
            selectedJobTemplate,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `请求失败 (${res.status})`);
        }

        const data = await res.json();

        // 保存简历分析结果
        if (data.resumeAnalysis) {
          setResumeAnalysis(data.resumeAnalysis);
        }

        // 进入通话阶段，传递 WebSocket 连接信息
        // 将连接信息存储在 ref 中供 CallView 使用
        wsInfoRef.current = {
          sessionToken: data.sessionToken,
          wsUrl: data.wsUrl,
        };

        // 乐观插入侧边栏会话列表
        const skeletonChat = {
          id: chatIdRef.current,
          title: "电话面试",
          createdAt: new Date(),
          userId: "",
          visibility: "private" as const,
          chatType: "realtime",
          lastContext: null,
        };
        const sidebarKey = unstable_serialize(getChatHistoryPaginationKey);
        mutate(
          sidebarKey,
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

        setPhase("call");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "创建面试会话失败"
        );
      }
    },
    [selectedModel, mutate, selectedJobTemplate]
  );

  const wsInfoRef = useRef<{
    sessionToken: string;
    wsUrl: string;
  } | null>(null);

  /**
   * 面试结束
   */
  const handleCallEnd = useCallback(
    async (finalTranscript: TranscriptEntry[], duration: number) => {
      setTranscript(finalTranscript);
      setCallDuration(duration);
      setPhase("summary");

      // 后台保存面试记录
      try {
        await fetch("/api/realtime/save-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatIdRef.current,
            transcript: finalTranscript,
            duration,
            model: selectedModel,
          }),
        });
        // 触发侧边栏 revalidate，同步后端保存的真实标题（含时长）
        mutate(unstable_serialize(getChatHistoryPaginationKey));
      } catch (err) {
        console.warn("保存面试记录失败:", err);
      }
    },
    [selectedModel, mutate]
  );

  // 通知父组件“是否有活跃会话”的状态变化
  useEffect(() => {
    onHasActiveChatChange?.(phase !== "preparation");
  }, [phase, onHasActiveChatChange]);

  // 注册/注销 session active 状态和挂断回调
  useEffect(() => {
    const isActive = phase === "call";
    setSessionActive(isActive);

    if (isActive) {
      setRequestEndSession(() => {
        return new Promise<void>((resolve) => {
          // 触发 CallView 的 handleEndCall
          endCallTriggerRef.current?.();
          // handleCallEnd 是同步被调用的，resolve 让外部知道挂断流程已启动
          // save-transcript 等后续操作在 handleCallEnd 内部异步完成
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

  return (
    <div className="flex flex-1 flex-col bg-background">
      {!hideHeader && (
        <ChatHeader
          chatId={chatIdRef.current}
          hasActiveChat={phase !== "preparation"}
          isReadonly={false}
          selectedVisibilityType="private"
        />
      )}
      {phase === "preparation" && (
        <PreparationView
          onJobTemplateChange={setSelectedJobTemplate}
          onModelChange={setSelectedModel}
          onStart={handleStartInterview}
          selectedJobTemplate={selectedJobTemplate}
          selectedModel={selectedModel}
        />
      )}

      {phase === "call" && wsInfoRef.current && (
        <CallView
          endCallTriggerRef={endCallTriggerRef}
          onEnd={handleCallEnd}
          sessionToken={wsInfoRef.current.sessionToken}
          wsUrl={wsInfoRef.current.wsUrl}
        />
      )}

      {phase === "summary" && (
        <InterviewSummary
          callDuration={callDuration}
          chatId={chatIdRef.current}
          onNewInterview={() => {
            // 重置状态
            chatIdRef.current = generateUUID();
            setTranscript([]);
            setCallDuration(0);
            setResumeAnalysis(null);
            setPhase("preparation");
          }}
          resumeAnalysis={resumeAnalysis}
          transcript={transcript}
        />
      )}
    </div>
  );
}
