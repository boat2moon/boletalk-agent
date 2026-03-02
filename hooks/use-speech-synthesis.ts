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
    isProcessingQueueRef.current = false;
    setIsSpeaking(false);
  }, []);

  // 单次播放（旧接口，消息朗读按钮用）
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

      const blob = await fetchTTS(text, controller.signal);
      if (blob && !stoppedRef.current) {
        await playBlob(blob);
      }
      setIsSpeaking(false);
    },
    [fetchTTS, playBlob, stop]
  );

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
  }, []);

  // 恢复当前播放
  const resume = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play().catch(console.error);
      setIsSpeaking(true);
    }
  }, []);

  // 直接播放 base64 音频（服务端推送模式，不走 HTTP）
  const speakBase64 = useCallback(
    (base64: string, mimeType = "audio/mpeg") => {
      stoppedRef.current = false;
      setIsSpeaking(true);

      // base64 → Blob 是同步的，直接 resolve
      const blobPromise = Promise.resolve(
        (() => {
          try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return new Blob([bytes], { type: mimeType });
          } catch {
            return null;
          }
        })()
      );

      queueRef.current.push(blobPromise);
      processQueue();
    },
    [processQueue]
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      for (const c of abortControllersRef.current) {
        c.abort();
      }
      audioRef.current?.pause();
    };
  }, []);

  return {
    speak,
    speakChunk,
    speakBase64,
    flushChunks,
    stop,
    pause,
    resume,
    isSpeaking,
  };
}
