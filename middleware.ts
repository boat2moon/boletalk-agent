import NextAuth from "next-auth";
import { authConfig } from "@/app/(auth)/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // 仅对需要 auth 的路由运行 middleware
  // 排除：静态资源、Next.js 内部路径、public 文件、API auth 路由
  matcher: [
    "/((?!_next/static|_next/image|images/|favicon\\.ico|vad/|api/auth).*)",
  ],
};
