"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey, type ChatHistory } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";
import { useVoiceMode, type VoiceMode } from "./voice-mode-context";
import { VoiceServiceStatus } from "./voice-service-status";

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
  const { speakBase64WithCache } = useGlobalSpeechSynthesis();
  const voiceModeRef = useRef(voiceMode);

  // 加载已有会话时，同步 voiceMode 到该会话的 chatType
  useEffect(() => {
    if (!initialChatType) return;
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
    // 仅在 mount 时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  // 标记是否已将新建会话乐观插入侧边栏
  const hasMutatedSidebar = useRef(initialMessages.length > 0);

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
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      // 收到服务端推送的 AI 生成标题时，乐观插入侧边栏
      const part = dataPart as { type: string; data?: unknown };
      if (part.type === "data-chat-title" && !hasMutatedSidebar.current) {
        hasMutatedSidebar.current = true;
        const optimisticChat = {
          id,
          title: part.data as string,
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
              return [{ chats: [optimisticChat], hasMore: false }] as ChatHistory[];
            }
            return [
              { ...currentData[0], chats: [optimisticChat, ...currentData[0].chats] },
              ...currentData.slice(1),
            ] as ChatHistory[];
          },
          { revalidate: false }
        );
      }
      if (dataPart.type === "data-usage") {
        setUsage(dataPart.data);
      }
      // 接收服务端推送的 TTS 音频（同时缓存）
      if (
        dataPart.type === "data-ttsAudio" &&
        voiceModeRef.current === "voice"
      ) {
        const { audioBase64, mimeType } = dataPart.data;
        // 获取当前最后一条 assistant 消息的 ID 用于缓存
        const lastMsg = messagesRef.current?.at(-1);
        const messageId =
          lastMsg?.role === "assistant" ? lastMsg.id : "unknown";
        speakBase64WithCache(messageId, audioBase64, mimeType);
      }
    },
    onFinish: () => {
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

  // 同步 messagesRef 以便 onData 中能获取最新消息
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 通知父组件“是否有活跃会话”的状态变化
  useEffect(() => {
    onHasActiveChatChange?.(messages.length > 0);
  }, [messages.length, onHasActiveChatChange]);


  const searchParams = useSearchParams();
  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="overscroll-behavior-contain flex min-w-0 flex-1 touch-pan-y flex-col bg-background">
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
          messages={messages}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={status}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onModelChange={setCurrentModelId}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          )}
        </div>
      </div>

      <Artifact
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
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

      <VoiceServiceStatus />
    </>
  );
}
