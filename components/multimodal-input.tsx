"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { SelectItem } from "@/components/ui/select";
import { useAliStreamingSTT } from "@/hooks/use-ali-streaming-stt";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { chatModels } from "@/lib/ai/models";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ApiCallUsage } from "./elements/api-call-usage";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CpuIcon,
  MicIcon,
  PaperclipIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";
import { useVoiceHealth } from "./voice-health-context";
import { useVoiceMode } from "./voice-mode-context";
import { useVoiceProvider } from "./voice-provider-context";
import { VoiceServiceStatus } from "./voice-service-status";

// 将文件读取为 base64 字符串的工具函数
// 使用 FileReader API 将文件转换为 Data URL，然后提取 base64 部分
const readFileAsBase64 = (inputFile: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // 移除 Data URL 前缀（例如 "data:application/pdf;base64,"），只保留纯 base64 字符串
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      } else {
        reject(new Error("Failed to read file as base64 string."));
      }
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(inputFile); // 以 Data URL 形式读取文件
  });

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  onStreamingTextChange,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  onStreamingTextChange?: (text: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const { voiceMode } = useVoiceMode();
  const { isTtsDown, isSttDown } = useVoiceHealth();
  const { setPendingStt } = useVoiceProvider();
  const {
    startListening,
    stopListening,
    cancelListening,
    isListening,
    isProcessing,
  } = useSpeechRecognition();

  // 流式 STT hook（预连接架构）
  const streamingSTT = useAliStreamingSTT();
  const isStreamingConnected = streamingSTT.connectionStatus === "ready";
  const isStreamingFailed = streamingSTT.connectionStatus === "failed";

  // 语音不可用时阻止录音
  const voiceUnavailable = isTtsDown || isSttDown;

  // 进入/离开语音模式时自动连接/断开流式 STT
  useEffect(() => {
    if (voiceMode === "voice") {
      streamingSTT.connect();
    } else {
      streamingSTT.disconnect();
    }
  }, [voiceMode, streamingSTT.connect, streamingSTT.disconnect]);

  // 通知父组件流式文本变化
  useEffect(() => {
    onStreamingTextChange?.(streamingSTT.isRecording ? streamingSTT.text : "");
  }, [streamingSTT.isRecording, streamingSTT.text, onStreamingTextChange]);

  // 语音模式：长按录音处理
  const handleVoiceStart = useCallback(async () => {
    if (status !== "ready") {
      return;
    }
    if (voiceUnavailable) {
      toast.error("语音服务暂时不可用，请联系管理员或稍后重试");
      return;
    }

    // 流式连接可用 → 使用流式模式
    if (isStreamingConnected) {
      const ok = await streamingSTT.startRecording();
      if (ok) {
        return;
      }
    }

    // 降级到传统模式
    startListening();
  }, [
    status,
    startListening,
    voiceUnavailable,
    isStreamingConnected,
    streamingSTT,
  ]);

  const handleVoiceEnd = useCallback(async () => {
    if (streamingSTT.isRecording) {
      // 流式模式：等待最终结果
      const streamingText = await streamingSTT.stopRecording();

      if (streamingText.trim()) {
        setPendingStt("ali-streaming");
        window.history.pushState({}, "", `/chat/${chatId}`);
        sendMessage({
          role: "user",
          parts: [
            ...attachments.map((attachment) => ({
              type: "file" as const,
              url: attachment.url,
              base64: attachment.base64,
              name: attachment.name,
              mediaType: attachment.contentType,
            })),
            { type: "text", text: streamingText },
          ],
        });
        setAttachments([]);
      } else {
        toast.error("未识别到语音内容，请重试");
      }
      return;
    }

    // 传统模式
    if (!isListening) {
      return;
    }
    const text = await stopListening();
    if (text.trim()) {
      setPendingStt("groq");
      window.history.pushState({}, "", `/chat/${chatId}`);
      sendMessage({
        role: "user",
        parts: [
          ...attachments.map((attachment) => ({
            type: "file" as const,
            url: attachment.url,
            base64: attachment.base64,
            name: attachment.name,
            mediaType: attachment.contentType,
          })),
          { type: "text", text },
        ],
      });
      setAttachments([]);
    } else {
      toast.error("未识别到语音内容，请重试");
    }
  }, [
    isListening,
    stopListening,
    streamingSTT,
    chatId,
    sendMessage,
    attachments,
    setAttachments,
    setPendingStt,
  ]);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, _setUploadQueue] = useState<string[]>([]);

  const submitForm = useCallback(() => {
    window.history.pushState({}, "", `/chat/${chatId}`);

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          base64: attachment.base64, // 将 base64 内容一并发送给服务端
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  // 文件上传到服务器的函数已被注释，改为前端直接读取 base64
  // const uploadFile = useCallback(async (file: File) => {
  //   const formData = new FormData();
  //   formData.append("file", file);
  //
  //   try {
  //     const response = await fetch("/api/files/upload", {
  //       method: "POST",
  //       body: formData,
  //     });
  //
  //     if (response.ok) {
  //       const data = await response.json();
  //       const { url, pathname, contentType } = data;
  //
  //       return {
  //         url,
  //         name: pathname,
  //         contentType,
  //       };
  //     }
  //     const { error } = await response.json();
  //     toast.error(error);
  //   } catch (_error) {
  //     toast.error("Failed to upload file, please try again!");
  //   }
  // }, []);

  // 使用消息数量作为刷新 key，每发送/收到消息后刷新使用次数
  const refreshKey = messages.length;

  // 文件选择处理函数：改为直接读取文件的 base64 内容，不再上传到服务器
  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const file = files[0]; // 只取第一个文件（不支持多选）

      if (!file) {
        return;
      }

      // 先检查文件类型：只允许 PDF
      if (file.type !== "application/pdf") {
        toast.error("仅支持 PDF 格式的文件");
        return;
      }

      // 再检查文件大小：限制 5MB
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        toast.error("文件过大，请上传 5MB 以内的 PDF 文件");
        return;
      }

      // 直接读取文件为 base64 字符串，不经过服务器上传
      const base64 = await readFileAsBase64(file);
      setAttachments([
        {
          name: file.name,
          url: "", // 不再有服务器 URL，设为空字符串
          base64, // 存储 base64 编码内容
          contentType: file.type,
        },
      ]);
    },
    [setAttachments]
  );

  // 图片粘贴功能已注释，当前不需要
  // const handlePaste = useCallback(
  //   async (event: ClipboardEvent) => {
  //     const items = event.clipboardData?.items;
  //     if (!items) {
  //       return;
  //     }
  //
  //     const imageItems = Array.from(items).filter((item) =>
  //       item.type.startsWith("image/")
  //     );
  //
  //     if (imageItems.length === 0) {
  //       return;
  //     }
  //
  //     // Prevent default paste behavior for images
  //     event.preventDefault();
  //
  //     setUploadQueue((prev) => [...prev, "Pasted image"]);
  //
  //     try {
  //       const uploadPromises = imageItems
  //         .map((item) => item.getAsFile())
  //         .filter((file): file is File => file !== null)
  //         .map((file) => uploadFile(file));
  //
  //       const uploadedAttachments = await Promise.all(uploadPromises);
  //       const successfullyUploadedAttachments = uploadedAttachments.filter(
  //         (attachment) =>
  //           attachment !== undefined &&
  //           attachment.url !== undefined &&
  //           attachment.contentType !== undefined
  //       );
  //
  //       setAttachments((curr) => [
  //         ...curr,
  //         ...(successfullyUploadedAttachments as Attachment[]),
  //       ]);
  //     } catch (error) {
  //       console.error("Error uploading pasted images:", error);
  //       toast.error("Failed to upload pasted image(s)");
  //     } finally {
  //       setUploadQueue([]);
  //     }
  //   },
  //   [setAttachments, uploadFile]
  // );

  // // 粘贴事件监听也一并注释
  // useEffect(() => {
  //   const textarea = textareaRef.current;
  //   if (!textarea) {
  //     return;
  //   }
  //
  //   textarea.addEventListener("paste", handlePaste);
  //   return () => textarea.removeEventListener("paste", handlePaste);
  // }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 &&
        !streamingSTT.isRecording &&
        !isListening && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        accept="application/pdf"
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        // multiple  // 不允许多选文件，只能选择单个 PDF
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      {/* 语音模式：长按录音按钮 */}
      {voiceMode === "voice" ? (
        <div className="flex flex-col items-center gap-3">
          {/* 附件预览 */}
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div
              className="flex w-full flex-row items-end gap-2 overflow-x-scroll px-1"
              data-testid="voice-attachments-preview"
            >
              {attachments.map((attachment) => (
                <PreviewAttachment
                  attachment={attachment}
                  key={attachment.url}
                  onRemove={() => {
                    setAttachments((currentAttachments) =>
                      currentAttachments.filter((a) => a.url !== attachment.url)
                    );
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              ))}
              {uploadQueue.map((filename) => (
                <PreviewAttachment
                  attachment={{
                    url: "",
                    name: filename,
                    contentType: "",
                  }}
                  isUploading={true}
                  key={filename}
                />
              ))}
            </div>
          )}
          {/* 流式识别预览气泡由 chat.tsx 在消息列表中渲染 */}

          {/* 连接状态 + 录音状态提示 */}
          <div className="min-h-[1.5em] max-w-[80%] text-center text-muted-foreground text-xs">
            {streamingSTT.connectionStatus === "connecting" ? (
              <span className="flex items-center justify-center gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
                正在连接高速语音服务...
              </span>
            ) : isProcessing ? (
              "正在识别..."
            ) : isListening || streamingSTT.isRecording ? (
              "松开结束录音"
            ) : isStreamingFailed ? (
              <span className="text-yellow-600">低速语音模式</span>
            ) : (
              "按住说话"
            )}
          </div>

          {/* 录音按钮 */}
          <button
            className={cn(
              "flex size-16 select-none items-center justify-center rounded-full border-2 transition-all duration-200",
              isListening || streamingSTT.isRecording
                ? "scale-110 border-red-500 bg-red-500/10 text-red-500 shadow-lg shadow-red-500/20"
                : isProcessing
                  ? "border-muted bg-muted text-muted-foreground"
                  : "border-primary bg-primary/5 text-primary hover:bg-primary/10 active:scale-95"
            )}
            data-testid="voice-record-button"
            disabled={
              status !== "ready" ||
              isProcessing ||
              voiceUnavailable ||
              streamingSTT.connectionStatus === "connecting"
            }
            onPointerDown={(e) => {
              e.preventDefault();
              handleVoiceStart();
            }}
            onPointerLeave={() => {
              // 手指滑出按钮时取消录音
              if (streamingSTT.isRecording) {
                streamingSTT.disconnect();
                streamingSTT.connect();
                toast.info("已取消录音");
              } else if (isListening) {
                cancelListening();
                toast.info("已取消录音");
              }
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              handleVoiceEnd();
            }}
            type="button"
          >
            <div
              className={cn(
                (isListening || streamingSTT.isRecording) && "animate-pulse"
              )}
            >
              <MicIcon size={24} />
            </div>
          </button>

          {/* 工具栏：文件上传 + 模型选择 */}
          <div className="flex w-full items-center justify-between px-1">
            <div className="flex items-center gap-0 sm:gap-0.5">
              <AttachmentsButton
                fileInputRef={fileInputRef}
                selectedModelId={selectedModelId}
                status={status}
              />
              <ModelSelectorCompact
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
            </div>
            <div className="flex items-center gap-2">
              <VoiceServiceStatus />
              <ApiCallUsage refreshKey={refreshKey} />
            </div>
          </div>
        </div>
      ) : (
        /* 文本模式：保持原有输入框 */
        <PromptInput
          className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
          onSubmit={(event) => {
            event.preventDefault();
            if (status !== "ready") {
              toast.error("Please wait for the model to finish its response!");
            } else {
              submitForm();
            }
          }}
        >
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div
              className="flex flex-row items-end gap-2 overflow-x-scroll"
              data-testid="attachments-preview"
            >
              {attachments.map((attachment) => (
                <PreviewAttachment
                  attachment={attachment}
                  key={attachment.url}
                  onRemove={() => {
                    setAttachments((currentAttachments) =>
                      currentAttachments.filter((a) => a.url !== attachment.url)
                    );
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              ))}

              {uploadQueue.map((filename) => (
                <PreviewAttachment
                  attachment={{
                    url: "",
                    name: filename,
                    contentType: "",
                  }}
                  isUploading={true}
                  key={filename}
                />
              ))}
            </div>
          )}
          <div className="flex flex-row items-start gap-1 sm:gap-2">
            <PromptInputTextarea
              autoFocus
              className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
              data-testid="multimodal-input"
              disableAutoResize={true}
              maxHeight={200}
              minHeight={44}
              onChange={handleInput}
              placeholder="输入消息..."
              ref={textareaRef}
              rows={1}
              value={input}
            />{" "}
            <ApiCallUsage refreshKey={refreshKey} />
          </div>
          <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
            <PromptInputTools className="gap-0 sm:gap-0.5">
              {/* PDF 附件上传按钮 */}
              <AttachmentsButton
                fileInputRef={fileInputRef}
                selectedModelId={selectedModelId}
                status={status}
              />
              <ModelSelectorCompact
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
            </PromptInputTools>

            {status === "submitted" ? (
              <StopButton setMessages={setMessages} stop={stop} />
            ) : (
              <PromptInputSubmit
                className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                data-testid="send-button"
                disabled={!input.trim() || uploadQueue.length > 0}
                status={status}
              >
                <ArrowUpIcon size={14} />
              </PromptInputSubmit>
            )}
          </PromptInputToolbar>
        </PromptInput>
      )}
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const _isReasoningModel = selectedModelId === "chat-model-reasoning";

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready"}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const selectedModel = chatModels.find(
    (model) => model.id === optimisticModelId
  );

  return (
    <PromptInputModelSelect
      onValueChange={(modelName) => {
        const model = chatModels.find((m) => m.name === modelName);
        if (model) {
          setOptimisticModelId(model.id);
          onModelChange?.(model.id);
          // 使用客户端 cookie 操作替代 Server Action
          // Server Action 会触发页面 revalidation，导致 attachments 等状态丢失
          // biome-ignore lint/suspicious/noDocumentCookie: intentional client-side cookie for model selection
          document.cookie = `chat-model=${model.id}; path=/; max-age=${60 * 60 * 24 * 365}`;
        }
      }}
      value={selectedModel?.name}
    >
      <Trigger asChild>
        <Button className="h-8 px-2" variant="ghost">
          <CpuIcon size={16} />
          <span className="hidden font-medium text-xs sm:block">
            {selectedModel?.name}
          </span>
          <ChevronDownIcon size={16} />
        </Button>
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[260px] p-0">
        <div className="flex flex-col gap-px">
          {chatModels.map((model) => (
            <SelectItem key={model.id} value={model.name}>
              <div className="truncate font-medium text-xs">{model.name}</div>
              <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
                {model.description}
              </div>
            </SelectItem>
          ))}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
