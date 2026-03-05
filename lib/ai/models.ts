export const DEFAULT_CHAT_MODEL: string = "chat-model-glm";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model",
    name: "Qwen 3.5 Flash",
    description: "通义千问 3.5 Flash 高速模型",
  },
  {
    id: "chat-model-glm",
    name: "GLM-4-Air",
    description: "智谱 GLM-4-Air 高性价比模型",
  },
];
