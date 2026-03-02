import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(10_000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png", "application/pdf"]), // 添加 PDF 类型支持
  name: z.string().min(1).max(100),
  url: z.string().optional(), // PDF 上传时没有 url，改为可选
  base64: z.string().optional(), // PDF 文件的 base64 编码内容（可选）
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  selectedChatModel: z.enum([
    "chat-model",
    "chat-model-reasoning",
    "chat-model-glm",
  ]),
  selectedVisibilityType: z.enum(["public", "private"]),
  voiceMode: z.boolean().optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
