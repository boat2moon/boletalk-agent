"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useVoiceHealth } from "./voice-health-context";
import { useVoiceMode } from "./voice-mode-context";

/**
 * 语音服务状态面板
 * 仅在语音模式下显示，使用 VoiceHealthContext 的实时状态
 * 紧凑横排，鼠标悬浮展示全部服务详情
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

  const activeTts = ttsServices.find((s) => s.status === "available");
  const activeStt = sttServices.find((s) => s.status === "available");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="text-[10px] opacity-50">🎙️</span>
            <ServiceBadge
              allDown={ttsServices.every((s) => s.status === "failed")}
              label="TTS"
              service={activeTts}
            />
            <span className="text-[10px] opacity-20">|</span>
            <ServiceBadge
              allDown={sttServices.every((s) => s.status === "failed")}
              label="STT"
              service={activeStt}
            />
            {hasAlert && (
              <span className="font-medium text-[10px] text-red-500 dark:text-red-400">
                ⚠️
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] p-0" side="top" sideOffset={8}>
          <div className="px-3 py-2.5 text-xs leading-relaxed">
            <div className="mb-1.5 font-semibold text-[10px] tracking-wide opacity-50">
              🎙️ 语音服务状态
            </div>
            <ServiceDetail label="TTS 文本→语音" services={ttsServices} />
            <ServiceDetail label="STT 语音→文本" services={sttServices} />
            {hasAlert && (
              <div className="mt-1.5 border-t pt-1.5">
                <div className="font-medium text-[10px] text-red-500 dark:text-red-400">
                  ⚠️{" "}
                  {isTtsDown && isSttDown
                    ? "TTS 和 STT"
                    : isTtsDown
                      ? "TTS"
                      : "STT"}{" "}
                  服务不可用
                  <br />
                  <span className="opacity-70">
                    请联系管理员，5分钟后自动重试
                  </span>
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const PROVIDER_NAMES: Record<string, string> = {
  "ali-tts": "阿里云",
  "doubao-tts": "豆包",
  "ali-streaming": "阿里云",
  minimax: "MiniMax",
  zhipu: "智谱",
  "zhipu-stt": "智谱",
  groq: "Groq",
};

const STREAMING_PROVIDERS = new Set(["ali-tts", "doubao-tts", "ali-streaming"]);

function displayProvider(p: string) {
  return PROVIDER_NAMES[p] || p;
}

/** 紧凑状态标签（底部栏内联显示） */
function ServiceBadge({
  label,
  service,
  allDown,
}: {
  label: string;
  service?: { provider: string; priority: number };
  allDown: boolean;
}) {
  const isStreaming = service
    ? STREAMING_PROVIDERS.has(service.provider)
    : false;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] opacity-50">{label}:</span>
      {service ? (
        <>
          <span className="inline-block h-[5px] w-[5px] rounded-full bg-green-500" />
          <span className="text-[11px] opacity-85">
            {displayProvider(service.provider)}
          </span>
          <span
            className={cn(
              "rounded px-1 font-semibold text-[9px]",
              isStreaming
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-gray-500/10 text-gray-500 dark:text-gray-400"
            )}
          >
            {isStreaming ? "流式" : "普通"}
          </span>
          {service.priority > 1 && (
            <span className="rounded bg-yellow-500/10 px-1 font-semibold text-[9px] text-yellow-600 dark:text-yellow-400">
              备选
            </span>
          )}
        </>
      ) : allDown ? (
        <>
          <span className="inline-block h-[5px] w-[5px] rounded-full bg-red-500" />
          <span className="text-[11px] text-red-500 opacity-85">故障</span>
        </>
      ) : null}
    </span>
  );
}

/** 详细服务列表（Tooltip 内展示） */
function ServiceDetail({
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
          {STREAMING_PROVIDERS.has(s.provider) && (
            <span className="rounded bg-blue-500/10 px-1 font-semibold text-[9px] text-blue-600 dark:text-blue-400">
              流式
            </span>
          )}
          {s.status === "available" && s.priority > 1 && (
            <span className="rounded bg-yellow-500/10 px-1 font-semibold text-[9px] text-yellow-600 dark:text-yellow-400">
              备选
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
