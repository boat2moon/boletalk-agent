import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { shouldUseSecureCookie } from "@/lib/constants";
import { cleanupExpiredGuests } from "@/lib/db/queries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/chat";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !shouldUseSecureCookie,
  });

  if (token) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // 懒清理：每次新建访客时，fire-and-forget 清除过期的旧访客数据
  cleanupExpiredGuests().catch(() => {});

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
