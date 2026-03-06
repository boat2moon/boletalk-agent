import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "伯乐Talk - AI 智能面试官",
    short_name: "伯乐Talk",
    description:
      "多模态 AI 面试助手，支持文本、语音、实时电话、数字人视频四种面试模式，集成 RAG 知识库与个性化记忆系统",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
