import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { ArrowDownIcon } from "lucide-react";
import { memo } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
};

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  return (
    <div className="relative flex-1">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {(() => {
            const filteredMessages = messages.filter((message, idx) => {
              // 过滤掉因为接收到早期 stream data（如 data-chat-title、data-usage）
              // 而意外创建的空 assistant 消息
              if (message.role === "assistant") {
                // streaming 期间保留最后一条 assistant 消息，
                // 即使暂无可渲染内容，让 PreviewMessage 内部显示"思考中"占位，
                // 避免 ThinkingMessage -> PreviewMessage 的 DOM 切换导致 CLS 闪烁
                if (status === "streaming" && idx === messages.length - 1) {
                  return true;
                }

                const hasRenderableContent = message.parts?.some((part) => {
                  // 有实际文本内容
                  if (part.type === "text") {
                    return part.text.length > 0;
                  }
                  // 有推理内容
                  if (part.type === "reasoning") {
                    return (part.text?.length ?? 0) > 0;
                  }
                  // tool 调用类型（以 tool- 开头的）视为有内容
                  if (
                    typeof part.type === "string" &&
                    part.type.startsWith("tool-")
                  ) {
                    return true;
                  }
                  // 其他类型（data-chat-title、data-usage、data-ttsAudio、step-start 等）
                  // 不视为可渲染内容
                  return false;
                });
                return !!hasRenderableContent;
              }
              return true;
            });

            return (
              <>
                {filteredMessages.map((message, index) => (
                  <PreviewMessage
                    chatId={chatId}
                    isLoading={
                      status === "streaming" &&
                      filteredMessages.length - 1 === index
                    }
                    isReadonly={isReadonly}
                    key={message.id}
                    message={message}
                    regenerate={regenerate}
                    requiresScrollPadding={
                      hasSentMessage && index === filteredMessages.length - 1
                    }
                    setMessages={setMessages}
                    vote={
                      votes
                        ? votes.find((vote) => vote.messageId === message.id)
                        : undefined
                    }
                  />
                ))}

                {status === "submitted" && <ThinkingMessage />}
              </>
            );
          })()}

          <div className="min-h-6 min-w-6 shrink-0" ref={messagesEndRef} />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`-translate-x-1/2 absolute bottom-4 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) {
    return true;
  }

  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.selectedModelId !== nextProps.selectedModelId) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages)) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }

  return false;
});
