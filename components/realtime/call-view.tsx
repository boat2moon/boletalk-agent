"use client";

/**
 * 阶段2：实时语音通话页面
 *
 * 核心功能：
 * - 通过 WebSocket 连接 bole-server（CF Worker）
 * - 采集麦克风音频并发送
 * - 接收并播放 AI 面试官的语音回复
 * - 显示实时字幕/transcript
 * - 通话控制（静音、结束）
 */

import { Loader2, Mic, MicOff, PhoneOff } from "lucide-react";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { TranscriptEntry } from "./realtime-page";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function CallView({
  wsUrl,
  sessionToken,
  onEnd,
  endCallTriggerRef,
}: {
  wsUrl: string;
  sessionToken: string;
  onEnd: (transcript: TranscriptEntry[], duration: number) => void;
  /** 外部可通过此 ref 触发正常挂断 */
  endCallTriggerRef?: MutableRefObject<(() => void) | null>;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  /** 下一个音频片段应当开始播放的时间（AudioContext 时间轴） */
  const nextPlayTimeRef = useRef<number>(0);
  /** 当前正在排队的音频源（用于打断时批量停止） */
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  /** 聊天区域滚动容器 */
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const isMutedRef = useRef(false);
  /** AI 说话状态延迟重置计时器 */
  const agentSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // 同步 transcript ref + 自动滚动
  useEffect(() => {
    transcriptRef.current = transcript;
    // 滚到底部
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // ── 按依赖顺序声明 useCallback（被依赖者在前面）──

  /**
   * 停止所有正在排队/播放的音频（用户打断时调用）
   */
  const stopAllAudio = useCallback(() => {
    for (const source of audioSourcesRef.current) {
      try {
        source.stop();
      } catch (_e) {
        // 忽略已停止的
      }
    }
    audioSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  /**
   * 清理所有资源
   */
  const cleanup = useCallback(() => {
    stopAllAudio();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional catch-and-ignore
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopAllAudio]);

  /**
   * 开始采集麦克风音频
   */
  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16_000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16_000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // 使用 ScriptProcessorNode 采集 PCM 数据
      // 注意：ScriptProcessorNode 已被标记为废弃，但 AudioWorklet 增加了复杂度
      // 未来可以迁移到 AudioWorklet
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (isMutedRef.current) {
          return;
        }
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);

        // 转换 Float32 → Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x80_00 : s * 0x7f_ff;
        }

        // Base64 编码后发送
        const bytes = new Uint8Array(pcmData.buffer);
        const base64 = btoa(String.fromCharCode(...bytes));

        wsRef.current.send(
          JSON.stringify({
            type: "audio",
            data: base64,
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      console.error("[Audio] Failed to start capture:", err);
      setStatus("error");
    }
  }, []);

  /**
   * 播放从服务端收到的音频数据（队列式，按顺序拼接播放）
   */
  const playAudio = useCallback((base64Data: string, _mimeType: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24_000 });
      }
      const ctx = audioContextRef.current;

      // base64 → Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 16-bit signed PCM → Float32（24kHz 单声道）
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32_768;
      }

      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24_000);
      audioBuffer.copyToChannel(float32Array, 0);

      const bufferSource = ctx.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(ctx.destination);

      // 计算该片段的播放开始时间
      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      bufferSource.start(startTime);

      // 更新下一个片段的开始时间
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      // 追踪，用于打断时停止和判断是否播放完毕
      audioSourcesRef.current.push(bufferSource);
      bufferSource.onended = () => {
        audioSourcesRef.current = audioSourcesRef.current.filter(
          (s) => s !== bufferSource
        );
        // 如果所有排队的音频都播完了，延迟一小段检查（避免分块之间的微小间隙导致动画闪烁）
        if (audioSourcesRef.current.length === 0) {
          if (agentSpeakingTimerRef.current) {
            clearTimeout(agentSpeakingTimerRef.current);
          }
          agentSpeakingTimerRef.current = setTimeout(() => {
            if (audioSourcesRef.current.length === 0) {
              setIsAgentSpeaking(false);
            }
          }, 150); // 150ms 防抖
        }
      };
    } catch (err) {
      console.error("[Audio] Playback error:", err);
    }
  }, []);

  /**
   * 启动通话计时器
   */
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  /**
   * 结束通话
   */
  const handleEndCall = useCallback(() => {
    // 通知服务端
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }

    const duration = Date.now() - startTimeRef.current;
    cleanup();
    onEnd(transcriptRef.current, duration);
  }, [onEnd, cleanup]);

  // 暴露 handleEndCall 给外部（通过 ref）
  useEffect(() => {
    if (endCallTriggerRef) {
      endCallTriggerRef.current = handleEndCall;
    }
    return () => {
      if (endCallTriggerRef) {
        endCallTriggerRef.current = null;
      }
    };
  }, [handleEndCall, endCallTriggerRef]);

  /**
   * 处理 bole-server 发来的消息
   */
  const handleServerMessage = useCallback(
    (data: string) => {
      try {
        const msg = JSON.parse(data);

        switch (msg.type) {
          case "ready":
            // Gemini 连接就绪，开始采集音频
            setStatus("connected");
            startAudioCapture();
            startTimer();
            break;

          case "audio":
            // 播放 AI 面试官的语音
            if (agentSpeakingTimerRef.current) {
              clearTimeout(agentSpeakingTimerRef.current);
              agentSpeakingTimerRef.current = null;
            }
            setIsAgentSpeaking(true);
            setIsUserSpeaking(false);
            playAudio(msg.data, msg.mimeType);
            break;

          case "transcript":
            // 最终确认的完整消息 — 替换、合并或追加
            setTranscript((prev) => {
              const last = prev.at(-1);
              // 上一条是同角色的非最终消息 → 替换为最终版
              if (last && last.role === msg.role && !last.isFinal) {
                return [
                  ...prev.slice(0, -1),
                  {
                    role: msg.role,
                    text: msg.text,
                    timestamp: Date.now(),
                    isFinal: true,
                  },
                ];
              }
              // 同一轮 assistant 回复的后续句子 → 合并到同一条消息
              if (
                last &&
                last.role === "assistant" &&
                msg.role === "assistant" &&
                last.isFinal
              ) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    text: `${last.text}\n${msg.text}`,
                    timestamp: Date.now(),
                  },
                ];
              }
              return [
                ...prev,
                {
                  role: msg.role,
                  text: msg.text,
                  timestamp: Date.now(),
                  isFinal: true,
                },
              ];
            });
            break;

          case "userSpeaking":
            // 检测到用户正在说话
            setIsUserSpeaking(true);
            break;

          case "transcript_update":
            // ASR 中间结果 — 用户仍在说话
            setIsUserSpeaking(true);
            // ASR 中间结果
            setTranscript((prev) => {
              const last = prev.at(-1);
              if (last && last.role === msg.role && !last.isFinal) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: msg.text, timestamp: Date.now() },
                ];
              }
              return [
                ...prev,
                {
                  role: msg.role,
                  text: msg.text,
                  timestamp: Date.now(),
                  isFinal: false,
                },
              ];
            });
            break;

          case "transcript_delta":
            // LLM 文本碎片
            setTranscript((prev) => {
              const last = prev.at(-1);
              if (last && last.role === msg.role) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    text: last.text + msg.text,
                    timestamp: Date.now(),
                  },
                ];
              }
              return [
                ...prev,
                {
                  role: msg.role,
                  text: msg.text,
                  timestamp: Date.now(),
                  isFinal: false,
                },
              ];
            });
            break;

          case "turnComplete":
            // 我们现在完全依靠音频的真实播放进度（bufferSource.onended）来结束跳动，
            // 不需要在这里根据服务端事件来猜测，这里只重置用户说话状态。
            setIsUserSpeaking(false);
            break;

          case "interrupted":
            stopAllAudio();
            setIsAgentSpeaking(false);
            break;

          case "sessionEnd":
            handleEndCall();
            break;

          case "pong":
            break;

          case "error":
            console.error("[Server Error]:", msg.message);
            toast.error(msg.message || "语音连接异常");
            break;

          default:
            break;
        }
      } catch (err) {
        console.error("[Message Parse Error]:", err);
      }
    },
    [handleEndCall, playAudio, startAudioCapture, startTimer, stopAllAudio]
  );

  /**
   * 初始化 WebSocket 连接和音频采集（含自动重连）
   */
  useEffect(() => {
    let cancelled = false;
    let reconnectAttempt = 0;
    const MAX_RECONNECT = 3;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        // 1. 建立 WebSocket 连接
        const ws = new WebSocket(`${wsUrl}?token=${sessionToken}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) {
            return;
          }
          console.log("[WS] Connected to bole-server");
          reconnectAttempt = 0; // 成功连接后重置重试计数
        };

        ws.onmessage = (event) => {
          if (cancelled) {
            return;
          }
          handleServerMessage(event.data);
        };

        ws.onclose = (event) => {
          if (cancelled) {
            return;
          }
          console.log(`[WS] Closed: ${event.code} ${event.reason}`);

          // 正常关闭（用户主动挂断）→ 不重连
          if (event.code === 1000) {
            setStatus("disconnected");
            return;
          }

          // 非正常关闭 → 尝试自动重连
          if (reconnectAttempt < MAX_RECONNECT) {
            reconnectAttempt++;
            const delay = 1000 * 2 ** (reconnectAttempt - 1); // 1s, 2s, 4s
            console.log(
              `[WS] 自动重连 ${reconnectAttempt}/${MAX_RECONNECT}，${delay / 1000}s 后...`
            );
            toast.info(
              `连接断开，正在重连 (${reconnectAttempt}/${MAX_RECONNECT})...`
            );
            setStatus("connecting");
            reconnectTimer = setTimeout(connect, delay);
          } else {
            toast.error(
              `连接断开: ${event.reason || `错误码 ${event.code}`}，已重试 ${MAX_RECONNECT} 次`
            );
            setStatus("disconnected");
          }
        };

        ws.onerror = () => {
          if (cancelled) {
            return;
          }
          // onerror 后通常会触发 onclose，重连逻辑在 onclose 中处理
        };
      } catch (err) {
        console.error("[Init] Failed:", err);
        setStatus("error");
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      cleanup();
    };
  }, [cleanup, handleServerMessage, sessionToken, wsUrl]);

  /**
   * 心跳（每 30 秒发一次 ping）
   */
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30_000);

    return () => clearInterval(heartbeat);
  }, []);

  /** 格式化时长 mm:ss */
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const SOUND_BARS = [0, 1, 2, 3, 4] as const;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <h1 className="font-semibold">模拟面试中</h1>
        <div className="font-mono text-muted-foreground text-sm">
          ⏱️ {formatDuration(callDuration)}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {status === "connecting" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-primary" size={48} />
            <p className="text-muted-foreground">正在连接面试官...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <PhoneOff className="text-destructive" size={36} />
            </div>
            <p className="text-destructive">连接失败</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              重试
            </Button>
          </div>
        )}

        {(status === "connected" || status === "disconnected") && (
          <>
            {/* 声波动画 keyframes */}
            <style>{`
              @keyframes bar-active {
                0%, 100% { height: 6px; }
                50% { height: 22px; }
              }
              @keyframes bar-idle {
                0%, 100% { height: 6px; opacity: 0.35; }
                50% { height: 10px; opacity: 0.55; }
              }
            `}</style>

            {/* 语音状态指示器 */}
            <div className="flex items-center gap-3 rounded-full border bg-muted/50 px-5 py-2.5 shadow-sm">
              <div className="flex h-6 items-center gap-1.5">
                {SOUND_BARS.map((i) => {
                  const isActive = isAgentSpeaking || isUserSpeaking;
                  return (
                    <div
                      className={`w-1.5 rounded-full ${
                        isAgentSpeaking
                          ? "bg-primary"
                          : isUserSpeaking
                            ? "bg-blue-500"
                            : "bg-muted-foreground"
                      }`}
                      key={`bar-${i}`}
                      style={{
                        animationName: isActive ? "bar-active" : "bar-idle",
                        animationDuration: isActive
                          ? `${0.4 + i * 0.08}s`
                          : `${1.8 + i * 0.2}s`,
                        animationTimingFunction: "ease-in-out",
                        animationIterationCount: "infinite",
                        animationDelay: `${i * 100}ms`,
                      }}
                    />
                  );
                })}
              </div>
              <span
                className={`font-medium text-sm ${
                  isAgentSpeaking
                    ? "text-primary"
                    : isUserSpeaking
                      ? "text-blue-500"
                      : status === "disconnected"
                        ? "text-muted-foreground"
                        : "text-foreground"
                }`}
              >
                {isAgentSpeaking
                  ? "面试官正在说话..."
                  : isUserSpeaking
                    ? "正在聆听..."
                    : status === "disconnected"
                      ? "面试已结束"
                      : "等待用户说话"}
              </span>
            </div>

            {/* 聊天气泡区域 */}
            <div
              className="flex w-full flex-1 flex-col overflow-y-auto px-2 md:px-4"
              ref={chatScrollRef}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 py-4">
                {transcript.map((entry, i) => (
                  <div
                    className={`group/message flex w-full items-start gap-2 md:gap-3 ${
                      entry.role === "user" ? "justify-end" : "justify-start"
                    }`}
                    key={`t-${entry.timestamp}-${entry.role}-${i}`}
                  >
                    {/* 面试官头像 */}
                    {entry.role === "assistant" && (
                      <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                        <SparklesIcon size={14} />
                      </div>
                    )}

                    {/* 消息气泡 */}
                    <div
                      className={`max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)] ${
                        entry.role === "user"
                          ? "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white"
                          : "text-left text-sm"
                      } ${!entry.isFinal && entry.role === "user" ? "opacity-60" : ""}`}
                      style={
                        entry.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      {entry.text}
                    </div>
                  </div>
                ))}

                {/* 面试官正在输入的提示 */}
                {isAgentSpeaking && transcript.at(-1)?.role !== "assistant" && (
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                      <div className="animate-pulse">
                        <SparklesIcon size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <span className="inline-flex">
                        <span className="animate-bounce [animation-delay:0ms]">
                          .
                        </span>
                        <span className="animate-bounce [animation-delay:150ms]">
                          .
                        </span>
                        <span className="animate-bounce [animation-delay:300ms]">
                          .
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部控制栏 */}
      {(status === "connected" || status === "connecting") && (
        <div className="flex items-center justify-center gap-6 border-t bg-background px-4 py-6">
          {/* 静音按钮 */}
          <Button
            className={`h-14 w-14 rounded-full ${
              isMuted
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
            onClick={() => setIsMuted(!isMuted)}
            size="icon"
            variant="ghost"
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </Button>

          {/* 挂断按钮 */}
          <Button
            className="h-16 w-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleEndCall}
            size="icon"
          >
            <PhoneOff size={28} />
          </Button>
        </div>
      )}
    </div>
  );
}
