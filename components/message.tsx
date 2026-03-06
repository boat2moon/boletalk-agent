"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { memo, useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, highlightRefs, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { useVoiceMode } from "./voice-mode-context";
import { useVoiceProvider } from "./voice-provider-context";
import { Weather } from "./weather";

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const { voiceMode } = useVoiceMode();
  const { getProvider } = useVoiceProvider();
  const providerInfo =
    voiceMode === "voice" ? getProvider(message.id) : undefined;

  /** provider key → 用户可读名 */
  const PROVIDER_LABEL: Record<string, string> = {
    "ali-tts": "阿里云 TTS",
    "doubao-tts": "豆包 TTS",
    "ali-streaming": "阿里云 ASR",
    "doubao-stt": "豆包 ASR",
    minimax: "MiniMax",
    zhipu: "智谱 TTS",
    "zhipu-stt": "智谱 ASR",
    groq: "Groq",
  };
  const providerLabel = (() => {
    if (!providerInfo) {
      return null;
    }
    if (message.role === "user" && providerInfo.stt) {
      return `🎙️ ${PROVIDER_LABEL[providerInfo.stt] || providerInfo.stt}`;
    }
    if (message.role === "assistant" && providerInfo.tts) {
      return `🔊 ${PROVIDER_LABEL[providerInfo.tts] || providerInfo.tts}`;
    }
    return null;
  })();

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div
            className={cn(
              "-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border",
              { "animate-pulse": isLoading }
            )}
          >
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "w-full":
              (message.role === "assistant" &&
                message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                )) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning" && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  isLoading={isLoading}
                  key={key}
                  reasoning={part.text}
                />
              );
            }

            if (type === "text") {
              if (mode === "view") {
                return (
                  <div
                    className={cn({
                      "streaming-text":
                        isLoading && message.role === "assistant",
                    })}
                    key={key}
                  >
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      <Response>
                        {message.role === "assistant"
                          ? highlightRefs(sanitizeText(part.text))
                          : sanitizeText(part.text)}
                      </Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-getWeather") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-getWeather" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={<Weather weatherAtLocation={part.output} />}
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={
                          "error" in part.output ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {String(part.output.error)}
                            </div>
                          ) : (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={part.output}
                              type="request-suggestions"
                            />
                          )
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            if (type === "tool-getResumeTemplate") {
              // 简历模板 tool 的渲染：显示模板内容
              const { toolCallId } = part;
              return (
                <div key={toolCallId}>
                  <Response>
                    {part.output?.template ?? "无法获取简历模板"}
                  </Response>
                </div>
              );
            }

            if (type === "tool-getBehaviouralQuestions") {
              // 行为面试题 tool 的渲染：显示面试题内容
              const { toolCallId } = part;
              return (
                <div key={toolCallId}>
                  <Response>
                    {part.output?.content ?? "无法获取行为面试题"}
                  </Response>
                </div>
              );
            }

            if (type === "tool-ragSearch") {
              const { toolCallId, state } = part;
              const query =
                "input" in part
                  ? (part.input as { query?: string })?.query
                  : undefined;
              return (
                <Tool defaultOpen={false} key={toolCallId}>
                  <ToolHeader
                    state={state}
                    type={
                      (query
                        ? `🔍 检索: ${query}`
                        : "🔍 知识库检索") as `tool-${string}`
                    }
                  />
                  <ToolContent>
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={
                          part.output?.found === false
                            ? (part.output?.message ?? "未找到结果")
                            : undefined
                        }
                        output={
                          part.output?.found ? (
                            <div className="text-muted-foreground text-xs">
                              找到 {part.output.resultCount} 条参考资料
                            </div>
                          ) : null
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            return null;
          })}

          {/* streaming 期间消息暂无可渲染内容时，显示"思考中"占位 */}
          {isLoading &&
            message.role === "assistant" &&
            !message.parts?.some(
              (p) =>
                (p.type === "text" && p.text.length > 0) ||
                (p.type === "reasoning" && (p.text?.length ?? 0) > 0) ||
                (typeof p.type === "string" && p.type.startsWith("tool-"))
            ) && (
              <div className="flex items-center gap-1.5 p-0 text-muted-foreground text-sm">
                <span className="animate-pulse">思考中</span>
                <span className="inline-flex gap-0.5">
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
                </span>
              </div>
            )}

          {providerLabel && (
            <div
              className={cn(
                "text-[10px] text-muted-foreground/60 leading-tight",
                {
                  "text-right": message.role === "user",
                  "text-left": message.role === "assistant",
                }
              )}
            >
              {providerLabel}
            </div>
          )}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }

    return false;
  }
);

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-2 md:gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1.5 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">思考中</span>
            <span className="inline-flex gap-0.5">
              <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
              <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
              <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
