import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, shouldUseSecureCookie } from "./lib/constants";

const guestTimestampRegex = /^guest-(\d+)$/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    // 当 GitHub OAuth 回调到达时，从请求中移除 session cookie
    // 这样 NextAuth adapter 不会看到活跃的 guest session，
    // 避免返回用户登录时 OAuthAccountNotLinked 错误
    if (pathname.startsWith("/api/auth/callback/")) {
      const requestHeaders = new Headers(request.headers);
      const allCookies = request.cookies.getAll();
      const filteredCookies = allCookies
        .filter((c) => !c.name.includes("session-token"))
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      requestHeaders.set("cookie", filteredCookies);

      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
    return NextResponse.next();
  }

  // 首页（Landing page）无需鉴权，允许未登录用户访问
  if (pathname === "/") {
    return NextResponse.next();
  }

  // 放行监控接口，无需鉴权
  // 心跳检测工具（如 cron-job.org）需要直接访问这些接口来检查服务/数据库状态
  if (pathname.startsWith("/api/monitor")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: shouldUseSecureCookie(request.url),
  });

  if (!token) {
    const redirectUrl = encodeURIComponent(request.url);

    return NextResponse.redirect(
      new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  // 访客 7 天强制过期：从 guest-{timestamp} 中提取创建时间，超过 7 天清除 session
  if (isGuest && token.email) {
    const match = token.email.match(guestTimestampRegex);
    if (match) {
      const createdAt = Number(match[1]);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - createdAt > sevenDays) {
        const response = NextResponse.redirect(
          new URL(
            "/api/auth/guest?redirectUrl=%2Fchat%3Fguest_expired%3Dtrue",
            request.url
          )
        );
        // 清除 session cookie，让 guest 路由创建全新访客
        response.cookies.delete("authjs.session-token");
        response.cookies.delete("__Secure-authjs.session-token");
        return response;
      }
    }
  }

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
