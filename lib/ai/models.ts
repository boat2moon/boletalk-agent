export const DEFAULT_CHAT_MODEL: string = "chat-model-glm";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model",
    name: "DeepSeek Chat",
    description: "DeepSeek V3 通用对话模型",
  },
  {
    id: "chat-model-reasoning",
    name: "DeepSeek Reasoner",
    description: "DeepSeek R1 深度思考模型，支持链式推理",
  },
  {
    id: "chat-model-glm",
    name: "GLM-4-Flash（免费）",
    description: "智谱 GLM-4-Flash 免费模型",
  },
];
