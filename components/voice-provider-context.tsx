"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export type VoiceProviderInfo = {
  stt?: string; // STT provider key, e.g. "groq", "doubao-stt"
  tts?: string; // TTS provider key, e.g. "minimax", "doubao-tts"
};

type VoiceProviderContextType = {
  /** 获取某条消息的语音 provider 信息 */
  getProvider: (messageId: string) => VoiceProviderInfo | undefined;
  /** 设置某条消息的 STT provider */
  setSttProvider: (messageId: string, provider: string) => void;
  /** 设置某条消息的 TTS provider */
  setTtsProvider: (messageId: string, provider: string) => void;
  /** 设置待关联的 STT provider（用户消息还未创建时） */
  setPendingStt: (provider: string) => void;
  /** 消费待关联的 STT provider */
  consumePendingStt: () => string | null;
  /** 版本号，用于触发子组件 re-render */
  version: number;
};

const VoiceProviderContext = createContext<VoiceProviderContextType>({
  getProvider: () => {
    /* noop */
  },
  setSttProvider: () => {
    /* noop */
  },
  setTtsProvider: () => {
    /* noop */
  },
  setPendingStt: () => {
    /* noop */
  },
  consumePendingStt: () => null,
  version: 0,
});

export function VoiceProviderProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<Map<string, VoiceProviderInfo>>(new Map());
  const pendingSttRef = useRef<string | null>(null);
  const [version, setVersion] = useState(0);

  // version 参与依赖确保 consumers 在 provider 变更后重新调用 getProvider
  // biome-ignore lint/correctness/useExhaustiveDependencies: version triggers re-computation
  const getProvider = useCallback(
    (messageId: string) => mapRef.current.get(messageId),
    [version]
  );

  const setSttProvider = useCallback((messageId: string, provider: string) => {
    const existing = mapRef.current.get(messageId) || {};
    mapRef.current.set(messageId, { ...existing, stt: provider });
    setVersion((v) => v + 1);
  }, []);

  const setTtsProvider = useCallback((messageId: string, provider: string) => {
    const existing = mapRef.current.get(messageId) || {};
    mapRef.current.set(messageId, { ...existing, tts: provider });
    setVersion((v) => v + 1);
  }, []);

  const setPendingStt = useCallback((provider: string) => {
    pendingSttRef.current = provider;
  }, []);

  const consumePendingStt = useCallback(() => {
    const val = pendingSttRef.current;
    pendingSttRef.current = null;
    return val;
  }, []);

  return (
    <VoiceProviderContext.Provider
      value={{
        getProvider,
        setSttProvider,
        setTtsProvider,
        setPendingStt,
        consumePendingStt,
        version,
      }}
    >
      {children}
    </VoiceProviderContext.Provider>
  );
}

export function useVoiceProvider() {
  return useContext(VoiceProviderContext);
}
