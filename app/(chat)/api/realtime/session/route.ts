/**
 * 创建实时面试会话 API
 *
 * POST /api/realtime/session
 *
 * 工作流程：
 * 1. 验证用户身份和配额
 * 2. 如有简历文本，调用 resume-analyze Agent 分析
 * 3. 构建 Realtime 面试官的 system prompt
 * 4. 签发 JWT sessionToken（给 bole-server 验证）
 * 5. 返回连接信息给前端
 */

import { z } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { buildJobContext } from "@/lib/ai/job-templates";
import { realtimeModels } from "@/lib/ai/realtime-models";
import { buildInterviewPrompt } from "@/lib/ai/toolkit/prompt-builder";
import {
  analyzeResume,
  buildRealtimePromptFromAnalysis,
  type ResumeAnalysis,
} from "@/lib/ai/toolkit/resume-analyzer";
import {
  getChatApiCallCountByUserId,
  recordChatApiCall,
  saveChat,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const requestSchema = z.object({
  /** 第一阶段由前端生成的会话 ID */
  chatId: z.string(),
  /** 选择的 Realtime 模型 ID */
  selectedModel: z.string(),
  /** 简历文本（可选，由前端解析 PDF 后传入） */
  resumeText: z.string().optional(),
  /** 语音选择（可选） */
  voice: z.string().optional(),
  /** 选中的职位 JD 模板（可选） */
  selectedJobTemplate: z.string().optional(),
});

/** bole-server 的 WebSocket 代理地址（占位，部署后替换） */
const BOLE_SERVER_WS_URL =
  process.env.BOLE_SERVER_WS_URL || "wss://bole-server.your-domain.workers.dev";

/** 用于签发 JWT 的密钥（需要和 bole-server 的 SESSION_SECRET 一致） */
const SESSION_SECRET =
  process.env.REALTIME_SESSION_SECRET || "dev-secret-change-me";

/** 构建默认面试 prompt（不上传简历时使用） */
const getDefaultInterviewPrompt = (jobContext?: string) =>
  buildInterviewPrompt({ mode: "phone", jobContext });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = requestSchema.parse(json);

    // 1. 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 2. 验证模型是否有效
    const model = realtimeModels.find((m) => m.id === body.selectedModel);
    if (!model || model.disabled) {
      return new ChatSDKError(
        "bad_request:api",
        undefined,
        "不支持的实时语音模型"
      ).toResponse();
    }

    // 3. 检查配额
    const userType: UserType = session.user.type;
    const apiCallCount = await getChatApiCallCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });
    const maxApiCalls = entitlementsByUserType[userType].maxChatApiCallsPerDay;

    if (apiCallCount >= maxApiCalls) {
      const errorMessage =
        userType === "guest"
          ? "您今天的使用次数已用完（10次/天）。请明天再试，或注册账号获得更多次数。"
          : "您今天的使用次数已用完（30次/天）。请明天再试。";
      return new ChatSDKError(
        "rate_limit:chat_api",
        undefined,
        errorMessage
      ).toResponse();
    }

    // 记录 API 调用
    await recordChatApiCall({ userId: session.user.id });

    // 4. 分析简历（如果提供了）
    let resumeAnalysis: ResumeAnalysis | null = null;
    const jobContext = buildJobContext(body.selectedJobTemplate);
    let interviewPrompt = getDefaultInterviewPrompt(jobContext);

    if (body.resumeText && body.resumeText.trim().length > 50) {
      try {
        resumeAnalysis = await analyzeResume(body.resumeText);
        // 将简历分析结果注入到面试官 prompt 中
        const resumeContext = buildRealtimePromptFromAnalysis(resumeAnalysis);
        interviewPrompt = buildInterviewPrompt({
          mode: "phone",
          resumeContext,
          jobContext,
        });
      } catch (err) {
        console.warn("简历分析失败，使用默认面试 prompt:", err);
        // 简历分析失败不阻断流程，使用默认 prompt
      }
    }

    // 5. 将会话记录先行持久化到数据库，支持前端 SWR revalidate（防止乐观 UI 消失）
    const sessionId = body.chatId;
    const now = new Date();
    await saveChat({
      id: sessionId,
      userId: session.user.id,
      title: `${now.getMonth() + 1}月${now.getDate()}日电话面试（进行中...）`,
      visibility: "private",
      chatType: "realtime",
    });

    // 6. 生成 session token（JWT）
    const token = await signJWT(
      {
        sessionId,
        systemPrompt: interviewPrompt,
        model: model.id,
        voice: body.voice || "zh_female_vv_jupiter_bigtts",
        userId: session.user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 35, // 35 分钟过期
      },
      SESSION_SECRET
    );

    // 7. 返回连接信息
    return Response.json({
      sessionToken: token,
      wsUrl: `${BOLE_SERVER_WS_URL}/ws/realtime`,
      sessionId,
      model: model.id,
      resumeAnalysis, // 前端需要展示分析结果
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("创建实时面试会话失败:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

/**
 * 签发 JWT token
 *
 * 使用 Web Crypto API，兼容 Edge Runtime
 */
async function signJWT(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);

  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/** 将 UTF-8 字符串编码为 base64url（支持中文等非 ASCII 字符） */
function base64UrlEncodeString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

const PLUS_RE = /\+/g;
const SLASH_RE = /\//g;
const TRAILING_EQ_RE = /=+$/;

/** 将字节数组编码为 base64url */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(PLUS_RE, "-")
    .replace(SLASH_RE, "_")
    .replace(TRAILING_EQ_RE, "");
}
