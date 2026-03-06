"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// 四种交互模式
// - text: 纯文本对话
// - voice: 基础语音（STT → LLM → TTS）
// - realtime: 电话面试（Realtime API，WebSocket 双向流）
// - avatar: 视频面试（Realtime + Avatar 渲染）
export type VoiceMode = "text" | "voice" | "realtime" | "avatar";

type VoiceModeContextType = {
  voiceMode: VoiceMode;
  toggleVoiceMode: () => void;
  setVoiceMode: (mode: VoiceMode) => void;
  /** 电话/视频面试是否正在通话中 */
  isSessionActive: boolean;
  /** 由 realtime-page / avatar-page 在通话开始/结束时调用 */
  setSessionActive: (active: boolean) => void;
  /** 正常挂断回调（由面试页面注册），返回 Promise 表示挂断完成 */
  requestEndSession: (() => Promise<void>) | null;
  /** 由面试页面注册/注销挂断回调 */
  setRequestEndSession: (fn: (() => Promise<void>) | null) => void;
};

const VoiceModeContext = createContext<VoiceModeContextType>({
  voiceMode: "text",
  toggleVoiceMode: () => {
    /* noop */
  },
  setVoiceMode: () => {
    /* noop */
  },
  isSessionActive: false,
  setSessionActive: () => {
    /* noop */
  },
  requestEndSession: null,
  setRequestEndSession: () => {
    /* noop */
  },
});

const VALID_MODES: VoiceMode[] = ["text", "voice", "realtime", "avatar"];

export function VoiceModeProvider({ children }: { children: ReactNode }) {
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>("text");
  const [isSessionActive, setSessionActive] = useState(false);
  const requestEndSessionRef = useRef<(() => Promise<void>) | null>(null);

  // 从 localStorage 恢复模式
  useEffect(() => {
    const stored = localStorage.getItem("voice-mode");
    if (stored && VALID_MODES.includes(stored as VoiceMode)) {
      setVoiceModeState(stored as VoiceMode);
    }
  }, []);

  const setVoiceMode = useCallback((mode: VoiceMode) => {
    setVoiceModeState(mode);
    localStorage.setItem("voice-mode", mode);
  }, []);

  // text ↔ voice 快速切换（保持向后兼容）
  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(voiceMode === "text" ? "voice" : "text");
  }, [voiceMode, setVoiceMode]);

  const setRequestEndSession = useCallback(
    (fn: (() => Promise<void>) | null) => {
      requestEndSessionRef.current = fn;
    },
    []
  );

  return (
    <VoiceModeContext.Provider
      value={{
        voiceMode,
        toggleVoiceMode,
        setVoiceMode,
        isSessionActive,
        setSessionActive,
        requestEndSession: requestEndSessionRef.current,
        setRequestEndSession,
      }}
    >
      {children}
    </VoiceModeContext.Provider>
  );
}

export function useVoiceMode() {
  return useContext(VoiceModeContext);
}
