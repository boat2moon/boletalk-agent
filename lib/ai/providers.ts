import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { zhipu } from "zhipu-ai-provider";
import { isTestEnvironment } from "../constants";

const dashscope = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY,
  // 禁用 @ai-sdk/openai 默认把 system prompt 转为 developer role 的行为（百炼暂不支持 developer role）
  // 考虑到 SDK v2 配置项可能不支持 compatibility: "strict"，我们用 fetch 拦截器修改请求体
  fetch: (url, options) => {
    if (options?.body && typeof options.body === "string") {
      try {
        const body = JSON.parse(options.body);
        if (body.messages && Array.isArray(body.messages)) {
          for (const msg of body.messages) {
            if (msg.role === "developer") {
              msg.role = "system";
            }
          }
        }
        options.body = JSON.stringify(body);
      } catch (_e) {
        // 解析失败则放行
      }
    }
    return fetch(url, options);
  },
});

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export const myProvider = isTestEnvironment
  ? (() => {
      const { artifactModel, chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : customProvider({
      languageModels: {
        "chat-model": dashscope.chat("qwen3.5-flash"),
        "chat-model-glm": zhipu("glm-4-air"),
        "eval-model": deepseek("deepseek-chat"),
        /** 内部管线用（意图分类、RAG、简历解析、GitHub 分析等） */
        "internal-model": deepseek("deepseek-chat"),
        "title-model": dashscope.chat("qwen3.5-flash"),
        "artifact-model": dashscope.chat("qwen3.5-flash"),
      },
    });
