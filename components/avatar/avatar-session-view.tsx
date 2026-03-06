"use client";

/**
 * 数字人面试会话视图
 *
 * 核心功能：
 * 1. 通过 BroadcastingAvatarSDK (CDN) + RTC channel 拉取数字人视频流
 * 2. 提供文本输入框，用户消息 → /api/avatar/send → Agent LLM → 数字人播报
 * 3. 显示对话记录
 * 4. "结束面试"按钮，调用 onEnd 回调
 */

import { Loader2, Mic, MicOff, Send, Square } from "lucide-react";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAvatarVoice, type VoiceStatus } from "@/hooks/use-avatar-voice";
import {
  buildRealtimePromptFromAnalysis,
  type ResumeAnalysis,
} from "@/lib/ai/toolkit/resume-analyzer";
import type { AvatarChannel, AvatarMessage } from "./avatar-page";

// ── BroadcastingAvatarSDK 类型声明 ──────────────────────────────

/** SDK 事件回调参数类型 */
// biome-ignore lint/nursery/useConsistentTypeDefinitions: interface needed for Window declaration merging consistency
interface AvatarSDKEvent {
  errorCode: number;
  source: string;
  errorMsg: string;
}

/** 通过 CDN 加载的 BroadcastingAvatarSDK 全局类型 */
declare global {
  // biome-ignore lint/nursery/useConsistentTypeDefinitions: must be interface for global declaration merging
  interface Window {
    BroadcastingAvatarSDK: new (options: {
      /** RTC 频道信息（注意：字段名需小驼峰） */
      channel: {
        channelId: string;
        token: string;
        expiredTime: string;
        userId: string;
        appId: string;
      };
      /** 视频渲染容器 */
      videoContainer: HTMLDivElement;
      /** 可选配置 */
      options?: {
        maxReconnectTimeout?: number;
        rtc?: {
          muted?: boolean;
          chromaKey?: boolean;
        };
      };
      /** 初始化成功回调 */
      onInitSuccess?: () => void;
      /** 错误回调 */
      onError?: (e: AvatarSDKEvent) => void;
      /** 警告回调 */
      onWarning?: (e: AvatarSDKEvent) => void;
    }) => {
      /** 初始化 RTC 拉流 */
      init: () => Promise<void>;
      /** 销毁实例，断开 RTC 拉流 */
      destroy: () => void;
      /** RTC 静音 */
      muteRtc: () => void;
      /** RTC 取消静音 */
      unMuteRtc: () => void;
    };
  }
}

/** BroadcastingAvatarSDK CDN 地址 */
const SDK_CDN_URL =
  "https://g.alicdn.com/xr-paas/avatar-dingrtc-sdk/0.0.5/index.js";

/**
 * 释放容器内所有 media 元素的媒体轨道（麦克风、音视频）
 *
 * SDK destroy() 有时不完全释放 media tracks，
 * 手动 stop 确保浏览器麦克风指示灯熄灭。
 */
function releaseMediaTracks(container: HTMLDivElement | null) {
  if (!container) {
    return;
  }
  for (const el of container.querySelectorAll("video, audio")) {
    const mediaEl = el as HTMLMediaElement;
    if (mediaEl.srcObject instanceof MediaStream) {
      for (const t of mediaEl.srcObject.getTracks()) {
        t.stop();
      }
    }
    mediaEl.srcObject = null;
  }
}

/**
 * 强制 SDK 内部生成的 video 元素正确显示并播放
 *
 * 解决两个问题：
 * 1. SDK 生成的 video 没有 CSS 填充容器
 * 2. Chrome autoplay 策略阻止了自动播放
 */
function forceVideoPlay(container: HTMLDivElement) {
  const videos = container.querySelectorAll("video");
  for (const video of videos) {
    // 样式：填满容器
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.style.display = "block";

    // 确保 autoplay 属性
    video.autoplay = true;
    video.playsInline = true;

    // 尝试播放
    if (video.paused) {
      video.play().catch(() => {
        // autoplay 被禁止，尝试静音后播放
        console.warn("[Avatar] autoplay blocked, trying muted playback");
        video.muted = true;
        video.play().catch((err) => {
          console.error("[Avatar] muted playback also failed:", err);
        });
      });
    }
  }
}

// ── 超时保护常量 ───────────────────────────────────────────

/** 最长会话时长（测试阶段 5 分钟） */
const MAX_SESSION_MS = 5 * 60 * 1000;
/** 用户无语音超时（1 分钟不说话自动关闭） */
const IDLE_TIMEOUT_MS = 60 * 1000;

// ── 组件 ─────────────────────────────────────────────────────

export function AvatarSessionView({
  sessionId,
  channel,
  resumeAnalysis,
  jobContext,
  onEnd,
  endCallTriggerRef,
}: {
  sessionId: string;
  channel: AvatarChannel;
  resumeAnalysis: ResumeAnalysis | null;
  /** 职位 JD 上下文（可选） */
  jobContext?: string;
  onEnd: (messages: AvatarMessage[], duration: number) => void;
  /** 外部可通过此 ref 触发正常结束面试 */
  endCallTriggerRef?: MutableRefObject<(() => void) | null>;
}) {
  const [messages, setMessages] = useState<AvatarMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSDKReady, setIsSDKReady] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<{
    init: () => Promise<void>;
    destroy: () => void;
  } | null>(null);
  const startTimeRef = useRef(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isEndingRef = useRef(false);

  // 生成简历上下文
  const resumeContext = resumeAnalysis
    ? buildRealtimePromptFromAnalysis(resumeAnalysis)
    : undefined;

  // ── 实时语音交互 ──────────────────────────────────
  const { voiceStatus, isVADReady } = useAvatarVoice({
    sessionId,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    resumeContext,
    jobContext,
    isAvatarSpeaking,
    onTranscript: useCallback((text: string) => {
      // VAD 识别到用户说话 → 添加用户消息
      const userMsg: AvatarMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // 用户说话了 → 重置空闲计时器
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!isEndingRef.current) {
          isEndingRef.current = true;
          toast.info("已超过 1 分钟未检测到语音，面试自动结束");
          handleEndRef.current();
        }
      }, IDLE_TIMEOUT_MS);
    }, []),
    onAgentReply: useCallback((text: string) => {
      // Agent 回复 → 添加助手消息 + 标记数字人说话中
      const assistantMsg: AvatarMessage = {
        role: "assistant",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsAvatarSpeaking(true);
      const estimatedDuration = Math.max(3000, text.length * 200);
      setTimeout(() => setIsAvatarSpeaking(false), estimatedDuration);
    }, []),
  });

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // 加载 SDK CDN 脚本并初始化 RTC 拉流
  useEffect(() => {
    let destroyed = false;

    async function initSDK() {
      // 1. 加载 CDN 脚本（如果未加载）
      if (!window.BroadcastingAvatarSDK) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = SDK_CDN_URL;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("加载数字人 SDK 失败"));
          document.head.appendChild(script);
        });
      }

      if (destroyed) {
        return;
      }

      // 2. 初始化 SDK
      if (!videoContainerRef.current) {
        return;
      }

      const container = videoContainerRef.current;

      const sdk = new window.BroadcastingAvatarSDK({
        channel: {
          channelId: channel.channelId,
          token: channel.token,
          expiredTime: channel.expireTime,
          userId: channel.userId,
          appId: channel.appId,
        },
        videoContainer: container,
        options: {
          maxReconnectTimeout: 300_000,
          rtc: {
            muted: false,
          },
        },
        onInitSuccess: () => {
          console.log("[Avatar] RTC 拉流成功 ✓");
          if (!destroyed) {
            setIsSDKReady(true);
            // 确保 SDK 生成的 video 元素正确显示并自动播放
            forceVideoPlay(container);
          }
        },
        onError: (e) => {
          console.error(
            `[Avatar] SDK Error: ${e.errorCode} (${e.source}) - ${e.errorMsg}`
          );
          if (!destroyed) {
            toast.error(`数字人连接错误: ${e.errorMsg}`);
          }
        },
        onWarning: (e) => {
          console.warn(
            `[Avatar] SDK Warning: ${e.errorCode} (${e.source}) - ${e.errorMsg}`
          );
        },
      });

      sdkRef.current = sdk;

      // 3. 初始化 RTC 拉流
      try {
        await sdk.init();
        // init 完成后再次尝试播放（双重保险）
        if (!destroyed) {
          forceVideoPlay(container);
        }
      } catch (err) {
        console.error("数字人 RTC 拉流失败:", err);
        if (!destroyed) {
          toast.error("数字人视频连接失败，请刷新重试");
        }
      }
    }

    initSDK();

    return () => {
      destroyed = true;
      if (sdkRef.current) {
        try {
          sdkRef.current.destroy();
        } catch {
          // ignore
        }
        sdkRef.current = null;
      }
      releaseMediaTracks(videoContainerRef.current);
    };
  }, [channel]);

  /**
   * 发送用户消息
   */
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) {
      return;
    }

    setInputText("");
    setIsSending(true);

    // 添加用户消息
    const userMsg: AvatarMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/avatar/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userText: text,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          resumeContext,
          jobContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`请求失败 (${res.status})`);
      }

      const data = await res.json();

      // 添加数字人回复
      const assistantMsg: AvatarMessage = {
        role: "assistant",
        content: data.replyText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // 半双工：数字人开始说话
      setIsAvatarSpeaking(true);
      const estimatedDuration = Math.max(
        3000,
        (data.replyText?.length || 0) * 200
      );
      setTimeout(() => setIsAvatarSpeaking(false), estimatedDuration);
    } catch (error) {
      toast.error("发送消息失败，请重试");
      console.error(error);
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, sessionId, messages, resumeContext, jobContext]);

  /**
   * 结束面试
   */
  const handleEnd = useCallback(() => {
    if (isEndingRef.current) {
      return;
    }
    isEndingRef.current = true;
    setIsEnding(true);

    // 清理超时定时器
    clearTimeout(maxTimerRef.current);
    clearTimeout(idleTimerRef.current);

    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    // 停止 RTC 拉流并释放麦克风
    if (sdkRef.current) {
      try {
        sdkRef.current.destroy();
      } catch {
        // ignore
      }
      sdkRef.current = null;
    }
    releaseMediaTracks(videoContainerRef.current);

    onEnd(messages, duration);
  }, [messages, onEnd]);

  // handleEndRef 用于定时器回调，避免 stale closure
  const handleEndRef = useRef(handleEnd);
  useEffect(() => {
    handleEndRef.current = handleEnd;
  }, [handleEnd]);

  // 暴露 handleEnd 给外部（通过 ref）
  useEffect(() => {
    if (endCallTriggerRef) {
      endCallTriggerRef.current = handleEnd;
    }
    return () => {
      if (endCallTriggerRef) {
        endCallTriggerRef.current = null;
      }
    };
  }, [handleEnd, endCallTriggerRef]);

  // ── 超时保护：最长 5 分钟 + 初始 1 分钟空闲 ─────────────
  useEffect(() => {
    // 5 分钟总时长保护
    maxTimerRef.current = setTimeout(() => {
      if (!isEndingRef.current) {
        toast.info("测试阶段每次面试最长 5 分钟，已自动结束");
        handleEndRef.current();
      }
    }, MAX_SESSION_MS);

    // 初始 1 分钟空闲保护（用户说话后会在 onTranscript 里重置）
    idleTimerRef.current = setTimeout(() => {
      if (!isEndingRef.current) {
        isEndingRef.current = true;
        toast.info("已超过 1 分钟未检测到语音，面试自动结束");
        handleEndRef.current();
      }
    }, IDLE_TIMEOUT_MS);

    return () => {
      clearTimeout(maxTimerRef.current);
      clearTimeout(idleTimerRef.current);
    };
  }, []); // 仅 mount 时启动

  /**
   * 键盘回车发送
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* 左侧：数字人视频区域（9:16 竖屏，宽度随高度自适应） */}
      <div className="relative aspect-[9/16] shrink-0 bg-black">
        {/* SDK 会在这个 div 内自动创建 video 元素 */}
        {/* biome-ignore lint/a11y/useSemanticElements: video container needs onClick for autoplay fallback */}
        <div
          className="avatar-video-container h-full w-full"
          onClick={() => {
            // 点击容器时尝试播放（处理 autoplay 被阻止的情况）
            if (videoContainerRef.current) {
              forceVideoPlay(videoContainerRef.current);
            }
          }}
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === " ") &&
              videoContainerRef.current
            ) {
              forceVideoPlay(videoContainerRef.current);
            }
          }}
          ref={videoContainerRef}
          role="button"
          tabIndex={0}
        />

        {/* 加载中遮罩 */}
        {!isSDKReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Loader2 className="mb-4 animate-spin text-white" size={32} />
            <p className="text-sm text-white/70">正在连接数字人...</p>
          </div>
        )}

        {/* 结束面试按钮 */}
        <div className="absolute top-4 right-4">
          <Button
            className="gap-2 rounded-full bg-red-600/80 text-white backdrop-blur hover:bg-red-600"
            disabled={isEnding}
            onClick={handleEnd}
            size="sm"
            variant="destructive"
          >
            <Square className="fill-current" size={12} />
            结束面试
          </Button>
        </div>

        {/* 计时器 */}
        <SessionTimer startTime={startTimeRef.current} />

        {/* 语音状态指示器 */}
        {isSDKReady && <VoiceStatusIndicator voiceStatus={voiceStatus} />}
      </div>

      {/* 右侧：对话区域 */}
      <div className="flex min-w-0 flex-1 flex-col border-l bg-background">
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <p className="py-8 text-center text-muted-foreground/50 text-sm">
              {isVADReady
                ? "麦克风已开启，直接说话即可..."
                : "输入文字开始面试对话..."}
            </p>
          )}
          {messages.map((msg, _i) => (
            <div
              className={`mb-2 ${msg.role === "user" ? "text-right" : "text-left"}`}
              key={`msg-${msg.timestamp}`}
            >
              <span
                className={`inline-block rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content}
              </span>
            </div>
          ))}
          {isSending && (
            <div className="mb-2 text-left">
              <span className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-muted-foreground text-sm">
                <Loader2 className="animate-spin" size={14} />
                面试官思考中...
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="flex items-end gap-2 border-t px-4 py-3">
          <textarea
            className="max-h-20 min-h-10 flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary"
            disabled={isSending}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的回答...（Enter 发送，Shift+Enter 换行）"
            rows={1}
            value={inputText}
          />
          <Button
            className="h-10 w-10 shrink-0 rounded-xl"
            disabled={!inputText.trim() || isSending}
            onClick={handleSend}
            size="icon"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 计时器子组件 ──────────────────────────────────────────────

function SessionTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 font-mono text-sm text-white/80 backdrop-blur">
      {minutes}:{seconds}
    </div>
  );
}

// ── 语音状态指示器 ──────────────────────────────────────────────

const VOICE_STATUS_MAP: Record<
  VoiceStatus,
  { icon: React.ReactNode; label: string; color: string }
> = {
  idle: {
    icon: <Loader2 className="animate-spin" size={14} />,
    label: "语音加载中...",
    color: "bg-gray-500/60",
  },
  listening: {
    icon: <Mic size={14} />,
    label: "正在听...",
    color: "bg-green-500/70",
  },
  speaking: {
    icon: <Mic className="animate-pulse" size={14} />,
    label: "说话中...",
    color: "bg-blue-500/70",
  },
  processing: {
    icon: <Loader2 className="animate-spin" size={14} />,
    label: "识别中...",
    color: "bg-yellow-500/70",
  },
  replying: {
    icon: <MicOff size={14} />,
    label: "数字人回复中",
    color: "bg-purple-500/70",
  },
  error: {
    icon: <MicOff size={14} />,
    label: "语音不可用",
    color: "bg-red-500/70",
  },
};

function VoiceStatusIndicator({ voiceStatus }: { voiceStatus: VoiceStatus }) {
  const status = VOICE_STATUS_MAP[voiceStatus];
  return (
    <div
      className={`absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white backdrop-blur ${status.color}`}
    >
      {status.icon}
      {status.label}
    </div>
  );
}
