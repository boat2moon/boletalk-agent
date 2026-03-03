"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

// 四种交互模式
// - text: 纯文本对话
// - voice: 基础语音（STT → LLM → TTS）
// - realtime: 电话面试（Realtime API，WebSocket 双向流）
// - avatar: 视频面试（Realtime + Avatar 渲染）—— 尚未实现
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

export function VoiceModeProvider({ children }: { children: ReactNode }) {
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>("text");

  const setVoiceMode = useCallback((mode: VoiceMode) => {
    setVoiceModeState(mode);
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
