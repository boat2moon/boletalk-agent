/**
 * 阿里云 NLS Token 获取 API
 *
 * 使用 @alicloud/pop-core SDK 调用 CreateToken 接口，
 * 返回 { token, appkey } 给前端，前端用于直连 NLS WebSocket。
 */

import RPCClient from "@alicloud/pop-core";

// Token 缓存（避免每次请求都调用阿里云 API）
let cachedToken: { token: string; expireTime: number } | null = null;

async function getToken(): Promise<string> {
  // 如果缓存的 token 还有 5 分钟以上有效期，直接返回
  if (cachedToken && cachedToken.expireTime > Date.now() / 1000 + 300) {
    return cachedToken.token;
  }

  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "Missing ALIBABA_CLOUD_ACCESS_KEY_ID or ALIBABA_CLOUD_ACCESS_KEY_SECRET"
    );
  }

  const client = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: "https://nls-meta.cn-shanghai.aliyuncs.com",
    apiVersion: "2019-02-28",
  });

  const result = await client.request<{
    Token: { Id: string; ExpireTime: number };
  }>("CreateToken", {}, { method: "POST" });

  cachedToken = {
    token: result.Token.Id,
    expireTime: result.Token.ExpireTime,
  };

  return cachedToken.token;
}

export async function POST() {
  try {
    const token = await getToken();
    const appkey = process.env.ALI_NLS_APPKEY;

    if (!appkey) {
      return Response.json(
        { error: "Missing ALI_NLS_APPKEY" },
        { status: 500 }
      );
    }

    return Response.json({ token, appkey });
  } catch (error) {
    console.error("[ali-asr] Failed to get token:", error);
    return Response.json({ error: "Failed to get NLS token" }, { status: 500 });
  }
}
