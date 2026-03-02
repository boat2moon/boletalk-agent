/**
 * Realtime 模型配置
 *
 * 独立于现有的 models.ts（文本模型），
 * 定义支持实时语音对话的模型列表。
 *
 * 这些模型使用 WebSocket 双向音频流协议，
 * 由 bole-server（CF Worker）代理连接。
 */

export type RealtimeModel = {
  id: string;
  name: string;
  description: string;
  provider: "google" | "volcengine";
  disabled?: boolean;
};

export const DEFAULT_REALTIME_MODEL: string = "doubao-realtime";

export const realtimeModels: RealtimeModel[] = [
  {
    id: "doubao-realtime",
    name: "豆包实时语音",
    description: "字节跳动端到端实时语音大模型，中文对话体验佳",
    provider: "volcengine",
  },
  {
    id: "gemini-2.0-flash-live",
    name: "Gemini Flash Live",
    description: "Google 实时语音，低延迟高性价比（即将推出）",
    provider: "google",
    disabled: true,
  },
];
