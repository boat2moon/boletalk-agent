"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// 四种交互模式
// - text: 纯文本对话
// - voice: 基础语音（STT → LLM → TTS）
// - realtime: 高级语音（Realtime API，WebSocket 双向流）—— 尚未实现
// - avatar: 数字人面试官（Realtime + Avatar 渲染）—— 尚未实现
export type VoiceMode = "text" | "voice" | "realtime" | "avatar";

type VoiceModeContextType = {
  voiceMode: VoiceMode;
  toggleVoiceMode: () => void;
  setVoiceMode: (mode: VoiceMode) => void;
};

const VoiceModeContext = createContext<VoiceModeContextType>({
  voiceMode: "text",
  toggleVoiceMode: () => {
    /* noop */
  },
  setVoiceMode: () => {
    /* noop */
  },
});

const VALID_MODES: VoiceMode[] = ["text", "voice", "realtime", "avatar"];

export function VoiceModeProvider({ children }: { children: ReactNode }) {
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>("text");

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

  return (
    <VoiceModeContext.Provider
      value={{ voiceMode, toggleVoiceMode, setVoiceMode }}
    >
      {children}
    </VoiceModeContext.Provider>
  );
}

export function useVoiceMode() {
  return useContext(VoiceModeContext);
}
