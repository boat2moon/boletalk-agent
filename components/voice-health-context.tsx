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

/** 单个服务的健康状态 */
type ServiceHealth = {
  name: string;
  type: "tts" | "stt";
  provider: string; // 标识符：minimax / zhipu / groq
  status: "available" | "failed";
  priority: number;
  failedAt?: number; // 失败时间戳（用于冷却恢复）
};

type VoiceHealthContextType = {
  services: ServiceHealth[];
  /** 上报某个服务失败 */
  reportFailure: (providerKey: string) => void;
  /** 上报请求成功，并标记降级的服务 */
  reportSuccess: (provider: string, degradedList: string[]) => void;
  /** TTS 是否全挂 */
  isTtsDown: boolean;
  /** STT 是否全挂 */
  isSttDown: boolean;
};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟冷却

const VoiceHealthContext = createContext<VoiceHealthContextType>({
  services: [],
  reportFailure: () => {
    /* noop */
  },
  reportSuccess: () => {
    /* noop */
  },
  isTtsDown: false,
  isSttDown: false,
});

/** 初始服务列表 */
function createInitialServices(): ServiceHealth[] {
  return [
    {
      name: "Speech-02-Turbo",
      type: "tts",
      provider: "minimax",
      status: "available",
      priority: 1,
    },
    {
      name: "GLM-TTS",
      type: "tts",
      provider: "zhipu",
      status: "available",
      priority: 2,
    },
    {
      name: "Whisper-V3",
      type: "stt",
      provider: "groq",
      status: "available",
      priority: 1,
    },
    {
      name: "GLM-ASR",
      type: "stt",
      provider: "zhipu-stt",
      status: "available",
      priority: 2,
    },
  ];
}

export function VoiceHealthProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<ServiceHealth[]>(
    createInitialServices
  );
  const cooldownTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // 从 /api/voice-status 初始化（基于 Key 是否存在）
  useEffect(() => {
    fetch("/api/voice-status")
      .then((res) => res.json())
      .then((data) => {
        if (data?.services) {
          setServices((prev) =>
            prev.map((s) => {
              // 映射 API 返回的 provider 名到我们的 key
              const apiService = data.services.find(
                (api: { provider: string; type: string; priority: number }) =>
                  api.type === s.type && api.priority === s.priority
              );
              if (apiService && apiService.status === "unavailable") {
                return { ...s, status: "failed" as const };
              }
              return s;
            })
          );
        }
      })
      .catch(() => {
        /* silently ignore init failure */
      });
  }, []);

  // 标记服务失败，并启动冷却计时器
  const markFailed = useCallback((providerKey: string) => {
    setServices((prev) =>
      prev.map((s) =>
        s.provider === providerKey
          ? { ...s, status: "failed" as const, failedAt: Date.now() }
          : s
      )
    );

    // 清理旧计时器
    const existing = cooldownTimers.current.get(providerKey);
    if (existing) {
      clearTimeout(existing);
    }

    // 5 分钟后自动恢复
    const timer = setTimeout(() => {
      setServices((prev) =>
        prev.map((s) =>
          s.provider === providerKey
            ? { ...s, status: "available" as const, failedAt: undefined }
            : s
        )
      );
      cooldownTimers.current.delete(providerKey);
    }, COOLDOWN_MS);

    cooldownTimers.current.set(providerKey, timer);
  }, []);

  const reportFailure = useCallback(
    (providerKey: string) => {
      markFailed(providerKey);
    },
    [markFailed]
  );

  const reportSuccess = useCallback(
    (provider: string, degradedList: string[]) => {
      setServices((prev) =>
        prev.map((s) => {
          // 标记降级的服务为失败
          if (degradedList.includes(s.provider)) {
            return { ...s, status: "failed" as const, failedAt: Date.now() };
          }
          // 用到的服务标记为正常
          if (s.provider === provider) {
            return { ...s, status: "available" as const, failedAt: undefined };
          }
          return s;
        })
      );

      // 为降级的服务启动冷却计时器
      for (const degradedProvider of degradedList) {
        markFailed(degradedProvider);
      }
    },
    [markFailed]
  );

  const isTtsDown = services
    .filter((s) => s.type === "tts")
    .every((s) => s.status === "failed");

  const isSttDown = services
    .filter((s) => s.type === "stt")
    .every((s) => s.status === "failed");

  // 清理计时器
  useEffect(() => {
    return () => {
      for (const timer of cooldownTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <VoiceHealthContext.Provider
      value={{ services, reportFailure, reportSuccess, isTtsDown, isSttDown }}
    >
      {children}
    </VoiceHealthContext.Provider>
  );
}

export function useVoiceHealth() {
  return useContext(VoiceHealthContext);
}
