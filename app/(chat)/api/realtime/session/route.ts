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
import {
  analyzeResume,
  buildRealtimePromptFromAnalysis,
  type ResumeAnalysis,
} from "@/lib/ai/agent/resume-analyze";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { realtimeModels } from "@/lib/ai/realtime-models";
import {
  getChatApiCallCountByUserId,
  recordChatApiCall,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

const requestSchema = z.object({
  /** 选择的 Realtime 模型 ID */
  selectedModel: z.string(),
  /** 简历文本（可选，由前端解析 PDF 后传入） */
  resumeText: z.string().optional(),
  /** 语音选择（可选） */
  voice: z.string().optional(),
});

/** bole-server 的 WebSocket 代理地址（占位，部署后替换） */
const BOLE_SERVER_WS_URL =
  process.env.BOLE_SERVER_WS_URL || "wss://bole-server.your-domain.workers.dev";

/** 用于签发 JWT 的密钥（需要和 bole-server 的 SESSION_SECRET 一致） */
const SESSION_SECRET = process.env.REALTIME_SESSION_SECRET || "dev-secret-change-me";

/** 默认的模拟面试 system prompt（不上传简历时使用） */
const DEFAULT_INTERVIEW_PROMPT = `你是一个专业的程序员面试官，擅长前端技术栈，包括 HTML、CSS、JavaScript、TypeScript、React、Vue、Node.js、小程序等技术。

你正在进行一对一的实时语音模拟面试。请注意以下要求：

1. 你的回复会直接转为语音播放，所以要口语化、自然、简洁
2. 不要使用 Markdown 格式、代码块、表格等文字格式
3. 每次回复控制在 3-5 句话以内
4. 说话要像真实面试官一样，有亲和力但专业

模拟面试流程：
- 先让候选人自我介绍
- 询问离职原因（如果不是应届生）
- 出 2-3 道技术题（JS 基础、算法、场景设计）
- 询问项目经历和挑战
- 最后给出综合点评

每道题候选人回答后，给出简短点评，然后继续下一题。
全程最多 8-10 个问题，之后引导结束面试。`;

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
    let interviewPrompt = DEFAULT_INTERVIEW_PROMPT;

    if (body.resumeText && body.resumeText.trim().length > 50) {
      try {
        resumeAnalysis = await analyzeResume(body.resumeText);
        // 将简历分析结果注入到面试官 prompt 中
        const resumeContext = buildRealtimePromptFromAnalysis(resumeAnalysis);
        interviewPrompt = `${DEFAULT_INTERVIEW_PROMPT}\n\n${resumeContext}`;
      } catch (err) {
        console.warn("简历分析失败，使用默认面试 prompt:", err);
        // 简历分析失败不阻断流程，使用默认 prompt
      }
    }

    // 5. 生成 session token（JWT）
    const sessionId = generateUUID();
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

    // 6. 返回连接信息
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

/** 将字节数组编码为 base64url */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

