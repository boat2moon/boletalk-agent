"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceHealth } from "@/components/voice-health-context";

/**
 * TTS Hook — 支持单次播放和队列式 chunk 播放
 *
 * - speak(text): 单次播放（用于消息朗读按钮）
 * - speakChunk(text): 将 chunk 加入队列，顺序播放（用于流式 TTS）
 * - flushChunks(): 强制处理剩余文本
 * - stop(): 停止播放、清空队列、取消所有请求
 */
export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllersRef = useRef<AbortController[]>([]);
  const { reportSuccess, reportFailure } = useVoiceHealth();

  // 队列: 每个元素是一个 fetch 的 Promise<Blob | null>
  const queueRef = useRef<Promise<Blob | null>[]>([]);
  const isProcessingQueueRef = useRef(false);
  const stoppedRef = useRef(false);

  // 内部：fetch 一段文本的 TTS 音频
  const fetchTTS = useCallback(
    async (text: string, signal: AbortSignal): Promise<Blob | null> => {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 1024) }),
          signal,
        });

        // 健康追踪
        const provider = response.headers.get("X-Voice-Provider") || "";
        const degradedStr = response.headers.get("X-Voice-Degraded") || "";
        const degradedList = degradedStr ? degradedStr.split(",") : [];

        if (!response.ok) {
          if (degradedList.length > 0) {
            for (const d of degradedList) {
              reportFailure(d);
            }
          }
          return null;
        }

        if (provider && provider !== "none") {
          reportSuccess(provider, degradedList);
        }

        return await response.blob();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }
        console.error("TTS fetch error:", error);
        return null;
      }
    },
    [reportSuccess, reportFailure]
  );

  // 内部：播放一个 Blob
  const playBlob = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve) => {
      if (stoppedRef.current) {
        resolve();
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsSpeaking(true);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        resolve();
      };

      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        resolve();
      });
    });
  }, []);

  // 内部：处理队列
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) {
      return;
    }
    isProcessingQueueRef.current = true;

    while (queueRef.current.length > 0 && !stoppedRef.current) {
      const blobPromise = queueRef.current.shift();
      if (!blobPromise) {
        continue;
      }

      const blob = await blobPromise;
      if (blob && !stoppedRef.current) {
        await playBlob(blob);
      }
    }

    isProcessingQueueRef.current = false;
    if (queueRef.current.length === 0) {
      setIsSpeaking(false);
    }
  }, [playBlob]);

  // 停止一切
  const stop = useCallback(() => {
    stoppedRef.current = true;
    // 取消所有 fetch
    for (const c of abortControllersRef.current) {
      c.abort();
    }
    abortControllersRef.current = [];
    // 清空队列
    queueRef.current = [];
    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // 停止 MSE 播放
    if (mseAudioRef.current) {
      mseAudioRef.current.pause();
      mseAudioRef.current.src = "";
      mseAudioRef.current = null;
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    msePendingRef.current = [];
    mseReadyRef.current = false;
    mseEndedRef.current = false;
    isProcessingQueueRef.current = false;
    setIsSpeaking(false);
  }, []);

  // chunk 播放：加入队列（立即开始 fetch，队列顺序播放）
  const speakChunk = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }

      stoppedRef.current = false;
      setIsSpeaking(true);

      const controller = new AbortController();
      abortControllersRef.current.push(controller);

      // 立即开始 fetch（不等前面的播放完）
      const blobPromise = fetchTTS(text, controller.signal);
      queueRef.current.push(blobPromise);

      // 启动队列处理
      processQueue();
    },
    [fetchTTS, processQueue]
  );

  // flush：没有新的 chunk 了，等队列播完（外部调用，不需要做额外事情，队列会自动处理完）
  const flushChunks = useCallback(() => {
    // 队列已经在 processQueue 中自动处理，这里只要确保队列在跑
    processQueue();
  }, [processQueue]);

  // 暂停当前播放
  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
    // MSE 流式播放也需要暂停
    if (mseAudioRef.current && !mseAudioRef.current.paused) {
      mseAudioRef.current.pause();
      setIsSpeaking(false);
    }
  }, []);

  // 恢复当前播放
  const resume = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play().catch(console.error);
      setIsSpeaking(true);
    }
    // MSE 流式播放也需要恢复
    if (mseAudioRef.current?.paused) {
      mseAudioRef.current.play().catch(console.error);
      setIsSpeaking(true);
    }
  }, []);

  // ── MediaSource 流式播放（消除 chunk 切换卡带）──────────────
  const mseAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const msePendingRef = useRef<Uint8Array[]>([]);
  const mseReadyRef = useRef(false);
  const mseEndedRef = useRef(false);

  /** 尝试将队列中等待的 buffer 追加到 SourceBuffer */
  const flushMSEPending = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || msePendingRef.current.length === 0) {
      return;
    }
    const chunk = msePendingRef.current.shift();
    if (chunk) {
      try {
        sb.appendBuffer(chunk.buffer as ArrayBuffer);
      } catch {
        // QuotaExceededError 等 — fallback：放回队列
        msePendingRef.current.unshift(chunk);
      }
    }
  }, []);

  /** 初始化 MediaSource 播放器 */
  const initMSE = useCallback(() => {
    // 清理旧的
    if (mseAudioRef.current) {
      mseAudioRef.current.pause();
      mseAudioRef.current.src = "";
    }

    const ms = new MediaSource();
    const audio = new Audio();
    audio.src = URL.createObjectURL(ms);

    mseAudioRef.current = audio;
    mediaSourceRef.current = ms;
    mseReadyRef.current = false;
    mseEndedRef.current = false;
    msePendingRef.current = [];

    ms.addEventListener("sourceopen", () => {
      try {
        const sb = ms.addSourceBuffer("audio/mpeg");
        sourceBufferRef.current = sb;
        mseReadyRef.current = true;

        sb.addEventListener("updateend", () => {
          // 继续 flush 排队的 buffer
          if (msePendingRef.current.length > 0) {
            flushMSEPending();
          } else if (mseEndedRef.current && !sb.updating) {
            // 所有数据已追加完毕
            try {
              if (ms.readyState === "open") {
                ms.endOfStream();
              }
            } catch {
              /* ignore */
            }
          }
        });

        // flush 初始化前就到达的数据
        flushMSEPending();
      } catch {
        // 浏览器不支持 audio/mpeg MSE — 标记为不可用
        mseReadyRef.current = false;
      }
    });

    audio.play().catch(() => {
      // autoplay blocked — 后续用户交互后会触发
    });
  }, [flushMSEPending]);

  /** 检测浏览器是否支持 MSE audio/mpeg */
  const mseSupportedRef = useRef<boolean | null>(null);
  if (mseSupportedRef.current === null && typeof window !== "undefined") {
    mseSupportedRef.current =
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported("audio/mpeg");
  }

  // 直接播放 base64 音频（服务端推送模式，不走 HTTP）
  const speakBase64 = useCallback(
    (base64: string, mimeType = "audio/mpeg") => {
      stoppedRef.current = false;
      setIsSpeaking(true);

      // base64 → Uint8Array
      let bytes: Uint8Array;
      try {
        const binary = atob(base64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      } catch {
        return;
      }

      // MSE 模式：追加到 SourceBuffer（无缝播放）
      if (mseSupportedRef.current && mimeType === "audio/mpeg") {
        if (
          !mediaSourceRef.current ||
          mediaSourceRef.current.readyState === "ended"
        ) {
          initMSE();
        }

        msePendingRef.current.push(bytes);

        if (mseReadyRef.current) {
          flushMSEPending();
        }
        return;
      }

      // Fallback: 旧的 Blob 队列模式
      const blobPromise = Promise.resolve(
        new Blob([bytes.buffer as ArrayBuffer], { type: mimeType })
      );
      queueRef.current.push(blobPromise);
      processQueue();
    },
    [initMSE, flushMSEPending, processQueue]
  );

  /** 标记流式 TTS 结束，让 MediaSource 正确结束 */
  const endStreaming = useCallback(() => {
    mseEndedRef.current = true;
    const sb = sourceBufferRef.current;
    const ms = mediaSourceRef.current;
    if (
      sb &&
      !sb.updating &&
      msePendingRef.current.length === 0 &&
      ms?.readyState === "open"
    ) {
      try {
        ms.endOfStream();
      } catch {
        /* ignore */
      }
    }

    // 监听播放结束
    const audio = mseAudioRef.current;
    if (audio) {
      audio.onended = () => {
        setIsSpeaking(false);
        mseAudioRef.current = null;
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
      };
    }
  }, []);

  // 单次播放（消息朗读按钮用）
  // 支持流式（X-Voice-Streaming: true → MSE 边收边播）和非流式两种模式
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      // 停掉当前的
      stop();
      stoppedRef.current = false;

      const controller = new AbortController();
      abortControllersRef.current = [controller];
      setIsSpeaking(true);

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 1024) }),
          signal: controller.signal,
        });

        if (!response.ok || stoppedRef.current) {
          setIsSpeaking(false);
          return;
        }

        // 健康追踪
        const provider = response.headers.get("X-Voice-Provider") || "";
        const degradedStr = response.headers.get("X-Voice-Degraded") || "";
        const degradedList = degradedStr ? degradedStr.split(",") : [];
        if (provider && provider !== "none") {
          reportSuccess(provider, degradedList);
        } else if (degradedList.length > 0) {
          for (const d of degradedList) {
            reportFailure(d);
          }
        }

        const isStreaming =
          response.headers.get("X-Voice-Streaming") === "true";

        if (isStreaming && response.body) {
          // ── 流式：逐 chunk 读取，通过 MSE 边收边播 ──
          const reader = response.body.getReader();
          try {
            while (true) {
              if (stoppedRef.current) {
                reader.cancel();
                break;
              }
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              // Uint8Array → base64
              let binary = "";
              for (const byte of value) {
                binary += String.fromCharCode(byte);
              }
              const base64 = btoa(binary);
              speakBase64(base64, "audio/mpeg");
            }
          } finally {
            endStreaming();
          }
        } else {
          // ── 非流式：完整下载后播放 ──
          const blob = await response.blob();
          if (blob && !stoppedRef.current) {
            await playBlob(blob);
          }
          setIsSpeaking(false);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // 用户主动停止，忽略
        } else {
          console.error("TTS speak error:", error);
        }
        setIsSpeaking(false);
      }
    },
    [stop, playBlob, speakBase64, endStreaming, reportSuccess, reportFailure]
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      for (const c of abortControllersRef.current) {
        c.abort();
      }
      audioRef.current?.pause();
      // 清理 MSE
      if (mseAudioRef.current) {
        mseAudioRef.current.pause();
        mseAudioRef.current.src = "";
      }
    };
  }, []);

  // 直接播放 Blob 数组（按顺序），复用 playBlob + 队列机制
  const playBlobs = useCallback(
    (blobs: Blob[]) => {
      stoppedRef.current = false;
      setIsSpeaking(true);
      for (const blob of blobs) {
        queueRef.current.push(Promise.resolve(blob));
      }
      processQueue();
    },
    [processQueue]
  );

  return {
    speak,
    speakChunk,
    speakBase64,
    endStreaming,
    flushChunks,
    stop,
    pause,
    resume,
    isSpeaking,
    playBlobs,
  };
}
