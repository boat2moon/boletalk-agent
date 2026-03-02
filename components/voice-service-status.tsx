"use client";

import { useVoiceHealth } from "./voice-health-context";
import { useVoiceMode } from "./voice-mode-context";

/**
 * 语音服务状态面板
 * 仅在语音模式下显示，使用 VoiceHealthContext 的实时状态
 */
export function VoiceServiceStatus() {
  const { voiceMode } = useVoiceMode();
  const { services, isTtsDown, isSttDown } = useVoiceHealth();

  if (voiceMode !== "voice") {
    return null;
  }

  const ttsServices = services
    .filter((s) => s.type === "tts")
    .sort((a, b) => a.priority - b.priority);
  const sttServices = services
    .filter((s) => s.type === "stt")
    .sort((a, b) => a.priority - b.priority);

  const hasAlert = isTtsDown || isSttDown;

  return (
    <div className="fixed right-0 bottom-0 z-40 min-w-[185px] rounded-tl-xl border-zinc-200/60 border-t border-l bg-white/80 px-3 py-2.5 text-xs text-zinc-600 leading-relaxed shadow-sm backdrop-blur-xl dark:border-zinc-700/40 dark:bg-zinc-900/85 dark:text-zinc-400">
      <div className="mb-1.5 font-semibold text-[10px] tracking-wide opacity-50">
        🎙️ 语音服务
      </div>

      <ServiceGroup label="TTS 文本→语音" services={ttsServices} />
      <ServiceGroup label="STT 语音→文本" services={sttServices} />

      {hasAlert && (
        <div className="mt-1.5 border-zinc-200/40 border-t pt-1.5 dark:border-zinc-700/30">
          <div className="font-medium text-[10px] text-red-500 dark:text-red-400">
            ⚠️{" "}
            {isTtsDown && isSttDown ? "TTS 和 STT" : isTtsDown ? "TTS" : "STT"}{" "}
            服务不可用
            <br />
            <span className="opacity-70">请联系管理员，5分钟后自动重试</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceGroup({
  label,
  services,
}: {
  label: string;
  services: Array<{
    name: string;
    provider: string;
    status: string;
    priority: number;
  }>;
}) {
  // 显示的 provider 名称映射
  const displayProvider = (p: string) => {
    const map: Record<string, string> = {
      minimax: "MiniMax",
      zhipu: "智谱",
      "zhipu-stt": "智谱",
      groq: "Groq",
    };
    return map[p] || p;
  };

  return (
    <div className="mb-1">
      <div className="mb-0.5 font-medium text-[10px] opacity-45">{label}</div>
      {services.map((s) => (
        <div className="flex items-center gap-1.5 py-px" key={s.provider}>
          <span
            className={`h-[5px] w-[5px] shrink-0 rounded-full ${
              s.status === "available" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-[11px] opacity-85">
            {displayProvider(s.provider)}{" "}
            <span className="opacity-45">{s.name}</span>
          </span>
          {s.status === "available" && s.priority === 1 && (
            <span className="rounded bg-green-500/10 px-1 font-semibold text-[9px] text-green-600 dark:text-green-400">
              首选
            </span>
          )}
          {s.status === "available" && s.priority > 1 && (
            <span className="rounded bg-yellow-500/10 px-1 font-semibold text-[9px] text-yellow-600 dark:text-yellow-400">
              降级
            </span>
          )}
          {s.status === "failed" && (
            <span className="rounded bg-red-500/10 px-1 font-semibold text-[9px] text-red-500 dark:text-red-400">
              故障
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
