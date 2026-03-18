"use client";

import {
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Mic,
  Phone,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";

const modes = [
  {
    key: "text",
    icon: MessageSquare,
    label: "文本对话",
    color: "text-blue-500",
    activeBg: "bg-blue-500/10 border-blue-500/30",
    activeGlow: "shadow-blue-500/10",
    title: "AI Agent 全能文本对话",
    description:
      "多 Agent 工作流自动意图分类与分发，覆盖简历优化、模拟面试、面试题解答等全场景。支持 RAG 知识库检索与跨会话个性化记忆召回。",
    features: [
      "双层路由意图分发（确定性 + LLM 分类）",
      "RAG 知识库引用溯源",
      "Agent 记忆跨会话召回",
      "PDF 简历上传解析",
      "JD 模板注入定制面试",
      "MCP 工具：GitHub 分析 / 联网搜索 / 网页抓取",
    ],
    image: "/images/RAG-MCP-Tools2.gif",
  },
  {
    key: "voice",
    icon: Mic,
    label: "语音交互",
    color: "text-emerald-500",
    activeBg: "bg-emerald-500/10 border-emerald-500/30",
    activeGlow: "shadow-emerald-500/10",
    title: "双向流式语音面试",
    description:
      "边说边识别、边生成边播放。服务端双向流式 TTS 直连 LLM 文本流，前端 MediaSource Extensions 无缝播放消除卡带感。",
    features: [
      "阿里云 NLS 前端流式 ASR（边说边出字）",
      "豆包/CosyVoice 双向流式 TTS",
      "多厂商四级降级链保障可用性",
      "MediaSource Extensions 无缝音频播放",
      "文本流延迟释放实现音画同步",
      "全局 Provider 音频缓存零延迟重播",
    ],
    image: "/images/基础语音对话2.gif",
  },
  {
    key: "phone",
    icon: Phone,
    label: "端到端电话面试",
    color: "text-amber-500",
    activeBg: "bg-amber-500/10 border-amber-500/30",
    activeGlow: "shadow-amber-500/10",
    title: "端到端实时语音通话",
    description:
      "豆包端到端实时语音大模型，Cloudflare Durable Object 边缘代理，毫秒级延迟的真正双向同步对话。",
    features: [
      "豆包端到端实时语音大模型",
      "Cloudflare DO 有状态边缘代理",
      "自定义二进制帧协议编解码",
      "AudioContext 时间轴队列式音频播放",
      "JWT 鉴权 + Web Crypto API",
      "支持简历上传 + JD 模板选择",
    ],
    image: "/images/端到端电话面试2.gif",
  },
  {
    key: "avatar",
    icon: Video,
    label: "数字人视频面试",
    color: "text-purple-500",
    activeBg: "bg-purple-500/10 border-purple-500/30",
    activeGlow: "shadow-purple-500/10",
    title: "数字人视频面试",
    description:
      "数字人（可为VIP用户提供更真实模型） + 浏览器端 Silero VAD 语音检测 + 流式 ASR，免按钮实时视频面试体验。",
    features: [
      "数字人流媒体播报模式",
      "Silero VAD 浏览器端 ONNX 推理",
      "免按钮自动轮次判定",
      "逐句发送延迟优化（5s → 1~2s）",
      "打断式半双工支持",
      "WebRTC 实时视频流",
    ],
    image: "/images/数字人视频面试2.gif",
  },
];

export function ModesSection() {
  const [activeMode, setActiveMode] = useState(0);
  const current = modes[activeMode];

  // 预加载所有模式 GIF
  useEffect(() => {
    for (const m of modes) {
      if (m.image && !m.image.includes("placeholder")) {
        const img = new Image();
        img.src = m.image;
      }
    }
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Mode Tabs */}
      <div className="flex flex-wrap justify-center gap-3">
        {modes.map((mode, i) => {
          const Icon = mode.icon;
          const isActive = i === activeMode;
          return (
            <button
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-5 py-3 font-medium text-sm transition-all duration-300 ${
                isActive
                  ? `${mode.activeBg} shadow-lg ${mode.activeGlow} ${mode.color}`
                  : "border-border bg-card hover:border-border/80 hover:bg-accent"
              }`}
              key={mode.key}
              onClick={() => setActiveMode(i)}
              type="button"
            >
              <Icon className="size-5" />
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Mode Detail */}
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid gap-0 md:grid-cols-2">
          {/* Left: Info */}
          <div className="flex flex-col justify-center space-y-6 p-8 md:p-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <current.icon className={`size-6 ${current.color}`} />
                <span
                  className={`font-semibold text-xs uppercase tracking-wider ${current.color}`}
                >
                  {current.label}
                </span>
              </div>
              <h3 className="font-bold text-2xl md:text-3xl">
                {current.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {current.description}
              </p>
            </div>
            <ul className="space-y-2.5">
              {current.features.map((feat) => (
                <li className="flex items-start gap-2.5 text-sm" key={feat}>
                  <CheckCircle2
                    className={`mt-0.5 size-4 shrink-0 ${current.color}`}
                  />
                  <span className="text-muted-foreground">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Image/Placeholder */}
          <div className="flex items-center justify-center bg-muted/30 p-6 md:p-10">
            {current.image && !current.image.includes("placeholder") ? (
              <ImageWithSkeleton
                alt={current.label}
                className={`rounded-xl border-2 border-dashed ${current.activeBg} transition-colors duration-300`}
                key={current.key}
                skeletonClassName={`border-2 border-dashed ${current.activeBg}`}
                src={current.image}
              />
            ) : (
              <div
                className={`flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed ${current.activeBg} transition-colors duration-300`}
              >
                <current.icon
                  className={`mb-3 size-16 ${current.color} opacity-30`}
                />
                <span className="font-medium text-muted-foreground text-sm">
                  {current.label}演示截图 / GIF
                </span>
                <span className="mt-1 text-muted-foreground/60 text-xs">
                  后续替换为真实录屏
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mode comparison hint */}
      <p className="text-center text-muted-foreground text-sm">
        <ArrowRight className="mr-1 inline size-3.5 text-primary" />
        四种模式共享面试评估持久化、JD 模板注入等核心能力，按场景差异化配置
      </p>
    </div>
  );
}
