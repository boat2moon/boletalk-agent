"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import { useGlobalSpeechSynthesis } from "@/components/speech-synthesis-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import type { EvaluationData } from "./evaluation-card";
import { EvaluationPanel } from "./evaluation-panel";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";
import { useVoiceHealth } from "./voice-health-context";
import { useVoiceMode, type VoiceMode } from "./voice-mode-context";
import { useVoiceProvider } from "./voice-provider-context";

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialLastContext,
  hideHeader,
  onHasActiveChatChange,
  onEvaluationLockChange,
  initialChatType,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialLastContext?: AppUsage;
  /** 由外层 ModeAwareContainer 统一渲染 ChatHeader 时为 true */
  hideHeader?: boolean;
  /** 通知父组件“是否有活跃会话”状态变化 */
  onHasActiveChatChange?: (hasActive: boolean) => void;
  /** 通知父组件评估面板是否锁定（用于隐藏顶部栏按钮） */
  onEvaluationLockChange?: (locked: boolean) => void;
  /** 已有会话的类型，用于 mount 时同步 voiceMode */
  initialChatType?: string;
}) {
  const router = useRouter();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { voiceMode, setVoiceMode } = useVoiceMode();
  const {
    speakBase64WithCache,
    endStreamingWithCache,
    stop: stopSpeech,
  } = useGlobalSpeechSynthesis();
  const { reportSuccess, reportFailure } = useVoiceHealth();
  const { setSttProvider, setTtsProvider, consumePendingStt } =
    useVoiceProvider();
  const voiceModeRef = useRef(voiceMode);
  // 组件挂载标志：防止卸载后 onData 闭包仍触发 TTS
  const mountedRef = useRef(true);
  // 语音模式下，标记 LLM 文本生成已完成（但 TTS 可能还在处理）
  const [isTextDone, setIsTextDone] = useState(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 加载已有会话时，同步 voiceMode 到该会话的 chatType
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!initialChatType) {
      return;
    }
    const modeMap: Record<string, VoiceMode> = {
      text: "text",
      voice: "voice",
      realtime: "realtime",
      avatar: "avatar",
    };
    const target = modeMap[initialChatType];
    if (target && target !== voiceMode) {
      setVoiceMode(target);
    }
    // 仅在 mount 或打开新会话时执行一次。
    // 不要把 voiceMode 加入依赖，否则正在看已存文本会话时点击其他模式会被立即重置回 text 导致跳页失败。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChatType]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, refresh to sync with URL
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [_usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);

  // 职位 JD 模板选择
  const [selectedJobTemplate, setSelectedJobTemplate] = useState<
    string | undefined
  >();
  const [customJD, setCustomJD] = useState<string | undefined>();
  const jobTemplateRef = useRef(selectedJobTemplate);
  const customJDRef = useRef(customJD);

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    jobTemplateRef.current = selectedJobTemplate;
    customJDRef.current = customJD;
  }, [selectedJobTemplate, customJD]);

  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  // 标记是否已将新建会话乐观插入侧边栏
  const hasMutatedSidebar = useRef(initialMessages.length > 0);

  /**
   * 立即在侧边栏插入一条骨架占位（空标题），
   * 在 data-chat-title 到达前就让用户看到 loading 态。
   */
  const insertSkeletonToSidebar = useCallback(() => {
    if (hasMutatedSidebar.current) {
      return;
    }
    hasMutatedSidebar.current = true;
    const skeletonChat = {
      id,
      title: "", // 空标题 → sidebar 渲染为骨架
      createdAt: new Date(),
      userId: "",
      visibility: initialVisibilityType,
      chatType: voiceModeRef.current === "voice" ? "voice" : "text",
      lastContext: null,
    };
    const key = unstable_serialize(getChatHistoryPaginationKey);
    mutate(
      key,
      (currentData: ChatHistory[] | undefined) => {
        if (!currentData || currentData.length === 0) {
          return [{ chats: [skeletonChat], hasMore: false }] as ChatHistory[];
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
  }, [id, initialVisibilityType, mutate]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        return {
          body: {
            id: request.id,
            message: request.messages.at(-1),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            voiceMode: voiceModeRef.current === "voice",
            selectedJobTemplate:
              jobTemplateRef.current === "custom"
                ? `custom:${customJDRef.current || ""}`
                : jobTemplateRef.current,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      // ⏱ 前端计时：首个 SSE 数据到达
      if (sendStartRef.current > 0 && !firstDataRef.current) {
        firstDataRef.current = true;
        console.log(
          `[⏱ FE-TIMING] first onData   +${Date.now() - sendStartRef.current}ms`,
          (dataPart as any).type
        );
      }
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      // 收到服务端推送的 AI 生成标题时，乐观插入侧边栏
      const part = dataPart as { type: string; data?: unknown };
      if (part.type === "data-chat-title") {
        // AI 生成的标题到达 → 更新已有骨架占位的标题
        const title = part.data as string;
        const key = unstable_serialize(getChatHistoryPaginationKey);
        if (hasMutatedSidebar.current) {
          // 骨架已插入，只更新 title
          mutate(
            key,
            (currentData: ChatHistory[] | undefined) => {
              if (!currentData) {
                return currentData;
              }
              return currentData.map((page) => ({
                ...page,
                chats: page.chats.map((chat) =>
                  chat.id === id ? { ...chat, title } : chat
                ),
              })) as ChatHistory[];
            },
            { revalidate: false }
          );
        } else {
          // 以防万一骨架未插入（不应发生），直接插入带标题的
          hasMutatedSidebar.current = true;
          const optimisticChat = {
            id,
            title,
            createdAt: new Date(),
            userId: "",
            visibility: initialVisibilityType,
            chatType: voiceModeRef.current === "voice" ? "voice" : "text",
            lastContext: null,
          };
          mutate(
            key,
            (currentData: ChatHistory[] | undefined) => {
              if (!currentData || currentData.length === 0) {
                return [
                  { chats: [optimisticChat], hasMore: false },
                ] as ChatHistory[];
              }
              return [
                {
                  ...currentData[0],
                  chats: [optimisticChat, ...currentData[0].chats],
                },
                ...currentData.slice(1),
              ] as ChatHistory[];
            },
            { revalidate: false }
          );
        }
      }
      if (dataPart.type === "data-usage") {
        setUsage(dataPart.data);
      }
      // 注意：面试评估已改为直接调用 POST /api/chat/evaluation，不再经过 SSE
      // 接收服务端推送的 TTS 音频（同时缓存）
      if (
        dataPart.type === "data-ttsAudio" &&
        voiceModeRef.current === "voice" &&
        mountedRef.current
      ) {
        const { audioBase64, mimeType } = dataPart.data;
        // 获取当前最后一条 assistant 消息的 ID 用于缓存
        const lastMsg = messagesRef.current?.at(-1);
        const messageId =
          lastMsg?.role === "assistant" ? lastMsg.id : "unknown";
        speakBase64WithCache(messageId, audioBase64, mimeType);
      }
      // 流式 TTS 健康上报（自定义 data stream 类型）
      if (
        (dataPart as any).type === "data-ttsProvider" &&
        voiceModeRef.current === "voice" &&
        mountedRef.current
      ) {
        const { provider, degraded } = (dataPart as any).data as {
          provider: string;
          degraded: string[];
        };
        if (degraded.length > 0) {
          for (const d of degraded) {
            reportFailure(d);
          }
        }
        if (provider) {
          reportSuccess(provider, degraded);
        }

        // 关联 TTS provider 到当前 assistant 消息
        const lastAssistantMsg = messagesRef.current?.at(-1);
        if (lastAssistantMsg?.role === "assistant" && provider) {
          setTtsProvider(lastAssistantMsg.id, provider);
        }
      }
      // 收到 data-textDone 事件：LLM 文本生成完毕（TTS 还在处理）
      if (
        (dataPart as any).type === "data-textDone" &&
        voiceModeRef.current === "voice"
      ) {
        setIsTextDone(true);
      }
    },
    onFinish: () => {
      // 标记流式 TTS 结束，让 MediaSource 正确 endOfStream
      if (voiceModeRef.current === "voice") {
        endStreamingWithCache();
      }
      setIsTextDone(false); // 重置，为下一次对话准备
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          toast({
            type: "error",
            description: error.message,
          });
        }
      } else {
        toast({
          type: "error",
          description: error.message || "发送消息失败，请检查网络连接后重试",
        });
      }
    },
  });

  // 组件卸载时停止 TTS 音频播放（mountedRef 防御会阻止后续 onData 再触发新的 TTS）
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  // ⏱ 前端计时 ref
  const sendStartRef = useRef(0);
  const firstDataRef = useRef(false);
  const prevStatusRef = useRef(status);

  // ⏱ 监测 status 变化
  useEffect(() => {
    if (prevStatusRef.current !== status && sendStartRef.current > 0) {
      console.log(
        `[⏱ FE-TIMING] status: ${prevStatusRef.current} → ${status}  +${Date.now() - sendStartRef.current}ms`
      );
      if (status === "ready") {
        console.log(
          `[⏱ FE-TIMING] === total round-trip: ${Date.now() - sendStartRef.current}ms ===`
        );
        sendStartRef.current = 0;
        firstDataRef.current = false;
      }
    }
    prevStatusRef.current = status;
  }, [status]);

  /**
   * 包装 sendMessage：首次发送消息时先在侧边栏插入骨架占位
   */
  const wrappedSendMessage: typeof sendMessage = useCallback(
    (...args: Parameters<typeof sendMessage>) => {
      // ⏱ 前端计时：发起请求
      sendStartRef.current = Date.now();
      firstDataRef.current = false;
      console.log("[⏱ FE-TIMING] sendMessage called");
      insertSkeletonToSidebar();

      // 新消息发出 → 对话内容变化 → 标记评估过期 + 清空缓存
      evalStaleRef.current = true;
      setEvaluationData(null);
      setEvaluationError(null);

      return sendMessage(...args);
    },
    [sendMessage, insertSkeletonToSidebar]
  );

  // 同步 messagesRef 以便 onData 中能获取最新消息
  useEffect(() => {
    messagesRef.current = messages;

    // 消费 pending STT provider：当新增用户消息时关联 STT provider
    if (voiceModeRef.current === "voice" && messages.length > 0) {
      const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMsg) {
        const pending = consumePendingStt();
        if (pending) {
          setSttProvider(lastUserMsg.id, pending);
        }
      }
    }
  }, [messages, consumePendingStt, setSttProvider]);

  // 通知父组件“是否有活跃会话”的状态变化
  useEffect(() => {
    onHasActiveChatChange?.(messages.length > 0);
  }, [messages.length, onHasActiveChatChange]);

  const searchParams = useSearchParams();
  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      wrappedSendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, wrappedSendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // ── 面试评估状态 ──
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(
    null
  );
  const [showEvalPanel, setShowEvalPanel] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  // 评估加载中（发送了 evaluate intent 但还没收到结果）
  const [_evaluationLoading, setEvaluationLoading] = useState(false);
  // 标记评估是否已过期（用户发了新消息后置 true，防止 useSWR 用旧数据覆盖）
  const evalStaleRef = useRef(false);

  // 会话加载时 fetch 已有评估
  const { data: existingEvaluation } = useSWR<EvaluationData | null>(
    initialMessages.length >= 10 ? `/api/chat/evaluation?chatId=${id}` : null,
    async (url: string) => {
      try {
        const res = await fetch(url);
        if (res.status === 404) {
          return null;
        }
        if (!res.ok) {
          return null;
        }
        const data = await res.json();
        return data as EvaluationData;
      } catch {
        return null;
      }
    }
  );

  // 已有评估时自动加载（仅在未过期时）
  useEffect(() => {
    if (existingEvaluation && !evalStaleRef.current) {
      setEvaluationData(existingEvaluation);
    }
  }, [existingEvaluation]);

  /**
   * 发起评估请求
   *
   * 直接调用 POST /api/chat/evaluation 生成评估，不发送消息到聊天记录。
   * 评估数据存储在独立的 Evaluation 表中。
   */
  const { setOpen: setSidebarOpen } = useSidebar();

  // 使用 ref 避免 memo 闭包导致回调过期
  const evalLockRef = useRef(onEvaluationLockChange);
  evalLockRef.current = onEvaluationLockChange;
  const evaluationDataRef = useRef(evaluationData);
  evaluationDataRef.current = evaluationData;

  const handleEvaluate = useCallback(async () => {
    // 掐断当前 AI 输出 + TTS
    stop();
    stopSpeech();

    // 收起左侧栏 + 通知父组件锁定
    setSidebarOpen(false);
    evalLockRef.current?.(true);

    // 如果前端已有评估数据，直接展示（无需再请求）
    if (evaluationDataRef.current) {
      setShowEvalPanel(true);
      return;
    }

    setEvaluationLoading(true);
    setEvaluationError(null);
    setEvaluationData(null);
    setShowEvalPanel(true);

    try {
      // 调用 POST 接口生成评估（后端直接生成，缓存判断交给前端）
      const res = await fetch("/api/chat/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: id }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvaluationData(data);
        evalStaleRef.current = false; // 新评估已生成，重置过期标记
      } else {
        const errData = await res.json().catch(() => null);
        setEvaluationError(errData?.error || "评估生成失败");
      }
    } catch {
      setEvaluationError("网络错误，评估加载失败");
    } finally {
      setEvaluationLoading(false);
    }
  }, [stop, stopSpeech, setSidebarOpen, id]);

  const handleCloseEvalPanel = useCallback(() => {
    setShowEvalPanel(false);
    evalLockRef.current?.(false);
  }, []);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      {/* 主内容行：聊天区 + 评估面板 */}
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {/* 聊天区域 */}
        <div className="overscroll-behavior-contain relative flex min-w-0 flex-1 touch-pan-y flex-col bg-background">
          {!hideHeader && (
            <ChatHeader
              chatId={id}
              hasActiveChat={messages.length > 0}
              isReadonly={isReadonly}
              selectedVisibilityType={initialVisibilityType}
            />
          )}

          <Messages
            chatId={id}
            isArtifactVisible={isArtifactVisible}
            isReadonly={isReadonly}
            messages={
              streamingText
                ? [
                    ...messages,
                    {
                      id: "streaming-preview",
                      role: "user",
                      content: streamingText,
                      parts: [{ type: "text", text: streamingText }],
                    } as ChatMessage,
                  ]
                : messages
            }
            regenerate={regenerate}
            selectedModelId={initialChatModel}
            setMessages={setMessages}
            status={isTextDone ? "ready" : status}
            votes={votes}
          />

          <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
            {!isReadonly && (
              <MultimodalInput
                attachments={attachments}
                chatId={id}
                customJD={customJD}
                evaluationDisabled={showEvalPanel}
                input={input}
                messages={messages}
                onEvaluate={handleEvaluate}
                onJobTemplateChange={(
                  templateId: string | undefined,
                  jd?: string
                ) => {
                  setSelectedJobTemplate(templateId);
                  setCustomJD(jd);
                }}
                onModelChange={setCurrentModelId}
                onStreamingTextChange={setStreamingText}
                selectedJobTemplate={selectedJobTemplate}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                sendMessage={wrappedSendMessage}
                setAttachments={setAttachments}
                setInput={setInput}
                setMessages={setMessages}
                status={isTextDone ? "ready" : status}
                stop={stop}
              />
            )}
          </div>

          {/* 评估面板展开时：仅覆盖输入区的交互遮罩 */}
          {showEvalPanel && (
            <div className="absolute right-0 bottom-0 left-0 z-10 h-[100px] cursor-not-allowed" />
          )}
        </div>

        {/* 右侧评估面板（布局级，占据空间推动聊天区左移） */}
        <EvaluationPanel
          data={evaluationData}
          error={evaluationError}
          isVisible={showEvalPanel}
          onClose={handleCloseEvalPanel}
        />
      </div>

      {/* Artifact（fixed 定位覆盖层，独立于评估面板） */}
      <Artifact
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={wrappedSendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
