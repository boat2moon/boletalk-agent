import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { shouldUseSecureCookie } from "@/lib/constants";
import { cleanupExpiredGuests } from "@/lib/db/queries";

/**
 * 从请求头中解析真实的 base URL
 * 在阿里云 FC 环境中 request.url 的 host 为 0.0.0.0:3000，必须从 headers 中获取真实域名
 */
async function resolveBaseUrl(requestUrl: string): Promise<string> {
  try {
    const nextHeaders = await headers();
    const host =
      nextHeaders.get("x-fc-custom-domain") ||
      nextHeaders.get("x-forwarded-host") ||
      nextHeaders.get("host") ||
      "";
    const proto = nextHeaders.get("x-forwarded-proto") || "https";

    if (host && !host.includes("0.0.0")) {
      return `${proto}://${host}`;
    }
  } catch {
    // fallback
  }
  return new URL(requestUrl).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/chat";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: shouldUseSecureCookie(request.url),
  });

  if (token) {
    const baseUrl = await resolveBaseUrl(request.url);
    return NextResponse.redirect(new URL("/chat", baseUrl));
  }

  // 懒清理：每次新建访客时，fire-and-forget 清除过期的旧访客数据
  // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional fire-and-forget
  cleanupExpiredGuests().catch(() => {});

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
