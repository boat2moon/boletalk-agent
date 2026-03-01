/**
 * 聊天 API 路由
 *
 * 处理聊天相关的 HTTP 请求：
 * - POST: 发送消息并获取 AI 回复（流式响应）
 * - DELETE: 删除聊天记录
 *
 * 重构说明：
 * 原来的 AI 调用逻辑（streamText、tools 配置、usage 处理等）
 * 已经抽离到 lib/ai/agent/ 目录下的各个模块中。
 * 本文件只保留 HTTP 路由相关功能：请求解析、权限校验、消息保存等。
 */

import { geolocation } from "@vercel/functions";
import { JsonToSseTransformStream } from "ai";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { createChatStream } from "@/lib/ai/agent";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
import type { RequestHints } from "@/lib/ai/prompts";
import {
  createStreamId,
  deleteChatById,
  getChatApiCallCountByUserId,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  recordChatApiCall,
  saveChat,
  saveMessages,
  updateChatLastContextById,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { base64ToText } from "@/lib/file/base64totext";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(
          " > Resumable streams are disabled due to missing REDIS_URL"
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    // @ts-expect-error
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    // ========== API 调用次数限制 ==========
    // 查询用户 24 小时内的 API 调用次数
    const apiCallCount: number = await getChatApiCallCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    // 根据用户类型获取每日最大调用次数
    // @ts-expect-error
    const maxApiCalls = entitlementsByUserType[userType].maxChatApiCallsPerDay;
    console.log("apiCallCount => ", apiCallCount);
    // 如果超出限制，返回友好的中文提示
    if (apiCallCount >= maxApiCalls) {
      const errorMessage =
        userType === "guest"
          ? "您今天的聊天请求次数已用完（10次/天）。请明天再试，或注册账号获得更多次数（30次/天）。"
          : "您今天的聊天请求次数已用完（30次/天）。请明天再试。";
      return new ChatSDKError(
        "rate_limit:chat_api",
        undefined,
        errorMessage
      ).toResponse();
    }

    // 记录本次 API 调用
    await recordChatApiCall({ userId: session.user.id });

    // ========== 消息数量限制（原有逻辑）==========
    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    // @ts-expect-error
    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    // ========== PDF 文件解析（本地特有逻辑）==========
    // 从用户消息的 parts 中提取 base64 内容（如果有 PDF 文件附件的话）
    // 将文件类型的 part 替换为文本类型的 part，因为 AI 模型不能直接处理文件
    const newParts = await Promise.all(
      message.parts.map(async (part) => {
        if (
          part.type === "file" &&
          "base64" in part &&
          typeof part.base64 === "string"
        ) {
          const fileName = (part as any).name || "unknown.pdf";
          try {
            const pdfText = await base64ToText(part.base64);
            console.log(`PDF 解析成功，提取到 ${pdfText.length} 个字符`);
            return {
              type: "text" as const,
              text: `【用户上传的简历内容（来自 ${fileName}）】\n${pdfText}`,
            };
          } catch (error) {
            console.error("PDF 解析失败:", error);
            return {
              type: "text" as const,
              text: `<${fileName}>(文件解析失败)`,
            };
          }
        }
        return part;
      })
    );

    // 构造新的消息对象，使用处理后的 parts
    const newMessage: ChatMessage = {
      ...message,
      // @ts-expect-error
      parts: newParts,
    };

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else {
      // 新建聊天时，用处理后的 newMessage 生成标题
      const title = await generateTitleFromUserMessage({
        message: newMessage,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    }

    // 使用 newMessage 替代原始 message，确保传给 AI 的消息不包含原始文件 part
    const uiMessages = [...convertToUIMessages(messagesFromDb), newMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // 保存用户消息到数据库
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: newMessage.id,
          role: "user",
          parts: newMessage.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // ========== 调用 Agent 工作流（重构后的核心变化）==========
    // 原来这里有 100+ 行的 createUIMessageStream + streamText 逻辑
    // 现在抽离到 lib/ai/agent/index.ts 的 createChatStream 函数中
    const stream = createChatStream({
      messages: uiMessages,
      selectedChatModel,
      requestHints,
      // biome-ignore lint/style/noNonNullAssertion: session is checked above via auth()
      session: session!,
      // onFinish 回调：保存 AI 回复消息和 usage 到数据库
      onFinish: async ({ messages: finishedMessages, usage }) => {
        await saveMessages({
          messages: finishedMessages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });

        if (usage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: usage,
            });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }
        }
      },
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
