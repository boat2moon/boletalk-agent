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

  // MiniMax Speech-02 (优先)
  services.push({
    name: "Speech-02-Turbo",
    type: "tts",
    provider: "MiniMax",
    status: process.env.MINIMAX_API_KEY ? "available" : "unavailable",
    priority: 1,
  });

  // 智谱 GLM-TTS (降级)
  services.push({
    name: "GLM-TTS",
    type: "tts",
    provider: "智谱",
    status: process.env.ZHIPU_API_KEY ? "available" : "unavailable",
    priority: 2,
  });

  // === STT 服务 ===

  // Groq Whisper (优先)
  services.push({
    name: "Whisper-V3",
    type: "stt",
    provider: "Groq",
    status: process.env.GROQ_API_KEY ? "available" : "unavailable",
    priority: 1,
  });

  // 智谱 GLM-ASR (降级)
  services.push({
    name: "GLM-ASR",
    type: "stt",
    provider: "智谱",
    status: process.env.ZHIPU_API_KEY ? "available" : "unavailable",
    priority: 2,
  });

  return Response.json({ services });
}
