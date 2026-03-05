/**
 * 面试评估 API 路由
 *
 * - GET  /api/chat/evaluation?chatId=xxx  → 读取已有评估
 * - POST /api/chat/evaluation             → Phone/Avatar 模式生成评估
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { generateEvaluation } from "@/lib/ai/agent/evaluate";
import {
  getEvaluationByChatId,
  getMessagesByChatId,
  saveEvaluation,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";

/**
 * GET — 读取已有评估结果
 *
 * 用于：
 * - Text/Voice 模式下次打开会话时恢复评估
 * - Phone/Avatar 模式历史会话页面加载评估
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "Missing chatId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const evaluation = await getEvaluationByChatId({ chatId });
    if (!evaluation) {
      return Response.json({ error: "No evaluation found" }, { status: 404 });
    }
    return Response.json(evaluation);
  } catch (_error) {
    return Response.json(
      { error: "Failed to get evaluation" },
      { status: 500 }
    );
  }
}

/**
 * POST — 生成新的评估
 *
 * 流程：
 * 1. 接收 chatId
 * 2. 从 DB 读取该 chat 的全部消息历史
 * 3. 调用 generateEvaluation 生成结构化评估
 * 4. 写入 Evaluation 表 (upsert)
 * 5. 返回评估结果
 *
 * 注意：缓存判断由前端负责（evaluationData state + 发消息时清除）。
 * POST 被调用即表示需要（重新）生成评估。
 */
const postSchema = z.object({
  chatId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const json = await request.json();
    const { chatId } = postSchema.parse(json);

    // 从 DB 读取消息历史
    const dbMessages = await getMessagesByChatId({ id: chatId });

    if (dbMessages.length < 2) {
      return Response.json(
        { error: "对话消息不足，无法生成评估" },
        { status: 400 }
      );
    }

    // 转换为 ChatMessage 格式
    const messages: ChatMessage[] = dbMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      parts: msg.parts as ChatMessage["parts"],
      createdAt: msg.createdAt,
    }));

    // 生成评估
    const evaluationResult = await generateEvaluation(messages);

    // 写入 DB (upsert)
    await saveEvaluation({
      chatId,
      userId: session.user.id,
      scores: evaluationResult.scores,
      comments: evaluationResult.comments,
    });

    return Response.json(evaluationResult);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("评估生成失败:", error);
    return Response.json({ error: "评估生成失败" }, { status: 500 });
  }
}
