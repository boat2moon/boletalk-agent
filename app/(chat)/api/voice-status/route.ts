/**
 * 语音服务状态检查 API
 * 返回所有 TTS/STT 服务的可用性状态
 */

export const maxDuration = 10;

type ServiceStatus = {
  name: string;
  type: "tts" | "stt";
  provider: string;
  status: "available" | "unavailable";
  priority: number; // 数字越小优先级越高
};

export function GET() {
  const services: ServiceStatus[] = [];

  // === TTS 服务 ===

  // 豆包 TTS 2.0 (首选 — 流式)
  services.push({
    name: "TTS 2.0",
    type: "tts",
    provider: "豆包",
    status:
      process.env.DOUBAO_VOICE_APP_ID && process.env.DOUBAO_VOICE_ACCESS_TOKEN
        ? "available"
        : "unavailable",
    priority: 1,
  });

  // 阿里云 CosyVoice (备选 — 流式)
  services.push({
    name: "CosyVoice",
    type: "tts",
    provider: "阿里云",
    status: process.env.ALI_NLS_APPKEY ? "available" : "unavailable",
    priority: 2,
  });

  // MiniMax Speech-02 (备选2)
  services.push({
    name: "Speech-02-Turbo",
    type: "tts",
    provider: "MiniMax",
    status: process.env.MINIMAX_API_KEY ? "available" : "unavailable",
    priority: 3,
  });

  // 智谱 GLM-TTS (备选3)
  services.push({
    name: "GLM-TTS",
    type: "tts",
    provider: "智谱",
    status: process.env.ZHIPU_API_KEY ? "available" : "unavailable",
    priority: 4,
  });

  // 阿里云实时语音识别 (首选 — 前端流式)
  services.push({
    name: "实时语音识别",
    type: "stt",
    provider: "阿里云",
    status: process.env.ALI_NLS_APPKEY ? "available" : "unavailable",
    priority: 1,
  });

  // 豆包语音识别 2.0 (备选1 — 后端流式)
  services.push({
    name: "语音识别 2.0",
    type: "stt",
    provider: "豆包",
    status:
      process.env.DOUBAO_VOICE_APP_ID && process.env.DOUBAO_VOICE_ACCESS_TOKEN
        ? "available"
        : "unavailable",
    priority: 2,
  });

  // Groq Whisper (备选2)
  services.push({
    name: "Whisper-V3",
    type: "stt",
    provider: "Groq",
    status: process.env.GROQ_API_KEY ? "available" : "unavailable",
    priority: 3,
  });

  // 智谱 GLM-ASR (备选3)
  services.push({
    name: "GLM-ASR",
    type: "stt",
    provider: "智谱",
    status: process.env.ZHIPU_API_KEY ? "available" : "unavailable",
    priority: 4,
  });

  return Response.json({ services });
}
