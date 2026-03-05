"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";

type SpeechSynthesisContextType = ReturnType<typeof useSpeechSynthesis> & {
  /** 带缓存的 speakBase64：播放的同时按 messageId 缓存 Blob */
  speakBase64WithCache: (
    messageId: string,
    base64: string,
    mimeType?: string
  ) => void;
  /** 从缓存重播某条消息的音频，返回 true 表示命中缓存 */
  playFromCache: (messageId: string) => boolean;
  /** 检查某条消息是否有缓存 */
  hasCache: (messageId: string) => boolean;
  /** 标记流式 TTS 结束 */
  endStreamingWithCache: () => void;
};

const SpeechSynthesisContext = createContext<
  SpeechSynthesisContextType | undefined
>(undefined);

export function SpeechSynthesisProvider({ children }: { children: ReactNode }) {
  const synthesis = useSpeechSynthesis();

  // 按消息 ID 缓存音频 Blob 数组
  const audioCacheRef = useRef<Map<string, Blob[]>>(new Map());

  const speakBase64WithCache = useCallback(
    (messageId: string, base64: string, mimeType = "audio/mpeg") => {
      // 先解码 base64 → Blob
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });

        // 缓存
        const existing = audioCacheRef.current.get(messageId) || [];
        existing.push(blob);
        audioCacheRef.current.set(messageId, existing);
      } catch {
        // base64 解码失败，忽略缓存
      }

      // 正常播放（通过原始 hook 的 speakBase64）
      synthesis.speakBase64(base64, mimeType);
    },
    [synthesis]
  );

  const playFromCache = useCallback(
    (messageId: string): boolean => {
      const blobs = audioCacheRef.current.get(messageId);
      if (!blobs || blobs.length === 0) {
        return false;
      }

      // 先停掉当前播放，再通过 hook 的队列机制播放缓存的 blob
      // 合并所有小 chunk 为一个大 Blob，避免逐个播放产生卡顿
      synthesis.stop();
      const merged = new Blob(blobs, { type: blobs[0].type });
      synthesis.playBlobs([merged]);
      return true;
    },
    [synthesis]
  );

  const hasCache = useCallback((messageId: string): boolean => {
    const blobs = audioCacheRef.current.get(messageId);
    return !!blobs && blobs.length > 0;
  }, []);

  const endStreamingWithCache = useCallback(() => {
    synthesis.endStreaming();
  }, [synthesis]);

  const value: SpeechSynthesisContextType = {
    ...synthesis,
    speakBase64WithCache,
    playFromCache,
    hasCache,
    endStreamingWithCache,
  };

  return (
    <SpeechSynthesisContext.Provider value={value}>
      {children}
    </SpeechSynthesisContext.Provider>
  );
}

export function useGlobalSpeechSynthesis() {
  const context = useContext(SpeechSynthesisContext);
  if (context === undefined) {
    throw new Error(
      "useGlobalSpeechSynthesis must be used within a SpeechSynthesisProvider"
    );
  }
  return context;
}
