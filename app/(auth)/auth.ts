import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcrypt-ts";
import { drizzle } from "drizzle-orm/postgres-js";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Email from "next-auth/providers/nodemailer";
import { createTransport } from "nodemailer";
import { headers } from "next/headers";

import postgres from "postgres";
import { DUMMY_PASSWORD } from "@/lib/constants";
import {
  cleanupExpiredGuests,
  createGuestUser,
  getUser,
} from "@/lib/db/queries";
import {
  account as accountTable,
  user as userTable,
  verificationToken as verificationTokenTable,
} from "@/lib/db/schema";
import { authConfig } from "./auth.config";

export type UserType = "guest" | "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: "Required"
  interface User {
    id?: string;
    email?: string | null;
    type?: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

// 创建 Drizzle 实例用于 adapter
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * 拼接 SMTP 服务器地址
 * 从独立的环境变量拼接出完整的 SMTP URL
 */
function genEmailSmtpServer() {
  const from = process.env.EMAIL_FROM || "";
  const host = process.env.EMAIL_HOST || "";
  const port = process.env.EMAIL_PORT || "";
  const password = process.env.EMAIL_PASSWORD || "";
  const username = from.split("@")[0];
  const protocol = port === "465" ? "smtps" : "smtp";
  return `${protocol}://${username}:${password}@${host}:${port}`;
}

/**
 * 自定义发送 Magic Link 逻辑
 * 解决部署在阿里云 FC 等 Serverless 环境中，
 * Host 请求头被重写为 0.0.0.0:3000 的问题，支持多域名场景。
 */
async function sendVerificationRequest(params: any) {
  const { identifier, url, provider, theme } = params;
  let finalUrl = url;
  let finalHost = new URL(url).host;

  try {
    const nextHeaders = await headers();
    let actualHost = nextHeaders.get("x-forwarded-host") || nextHeaders.get("host") || "";
    let actualProto = nextHeaders.get("x-forwarded-proto") || "https";

    // 发现代理把 host 变成了容器内部IP（如 0.0.0.0）
    if (actualHost.includes("0.0.0") || actualHost.includes("127.0.0") || actualHost.includes("localhost")) {
      const referer = nextHeaders.get("referer");
      const origin = nextHeaders.get("origin");
      const fcDomain = nextHeaders.get("x-fc-custom-domain"); // 阿里云 FC 自定义域名头
      
      const sourceUrl = referer || origin;
      if (fcDomain) {
        actualHost = fcDomain;
      } else if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          actualHost = parsed.host;
          actualProto = parsed.protocol.replace(":", "");
        } catch {}
      }
    }

    if (actualHost && !actualHost.includes("0.0.0") && !actualHost.includes("127.0.0") && !actualHost.includes("localhost")) {
      const parsedUrl = new URL(url);
      parsedUrl.host = actualHost;
      parsedUrl.protocol = actualProto;
      
      const callbackUrl = parsedUrl.searchParams.get("callbackUrl");
      if (callbackUrl) {
        try {
          const parsedCb = new URL(callbackUrl);
          if (parsedCb.host.includes("0.0.0") || parsedCb.host.includes("127.0.0") || parsedCb.host.includes("localhost")) {
            parsedCb.host = actualHost;
            parsedCb.protocol = actualProto;
            parsedUrl.searchParams.set("callbackUrl", parsedCb.toString());
          }
        } catch {}
      }
      finalUrl = parsedUrl.toString();
      finalHost = actualHost;
    }
  } catch (err) {
    console.error("Rewrite Magic Link URL failed:", err);
  }

  const transport = createTransport(provider.server);
  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: `Sign in to ${finalHost}`,
    text: `Sign in to ${finalHost}\n${finalUrl}\n\n`,
    html: `
<body style="background: ${theme?.brandColor || "#f9f9f9"}; font-family: Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="max-width: 600px; margin: auto; border-radius: 10px; background: #fff; padding: 20px;">
    <tr>
      <td align="center" style="padding: 10px 0px; font-size: 22px; color: #333;">
        Sign in to <strong>${finalHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${theme?.buttonText || "#346df1"}">
              <a href="${finalUrl}" target="_blank"
                style="font-size: 18px; color: #fff; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${theme?.buttonText || "#346df1"}; display: inline-block; font-weight: bold;">
                Sign in
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; color: #666;">
        If you did not request this email you can safely ignore it.
      </td>
    </tr>
  </table>
</body>
`,
  });

  const failed = result.rejected.concat((result as any).pending || []).filter(Boolean);
  if (failed.length) {
    throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: userTable,
    accountsTable: accountTable,
    verificationTokensTable: verificationTokenTable,
  }),
  session: { strategy: "jwt" },
  providers: [
    // GitHub OAuth
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    // Magic Link 邮箱登录
    Email({
      server: genEmailSmtpServer(),
      from: process.env.EMAIL_FROM,
      sendVerificationRequest,
    }),
    // 邮箱密码登录
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return { ...user, type: "regular" };
      },
    }),
    // 访客登录
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
    }),
  ],
  callbacks: {
    signIn() {
      // 每次登录（访客/正式）都触发懒清理，fire-and-forget
      // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional fire-and-forget
      cleanupExpiredGuests().catch(() => {});
      return true;
    },
    jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.email = user.email;
        // Credentials 登录会带 type，OAuth/MagicLink 默认为 regular
        token.type = user.type || "regular";
      }
      // OAuth/MagicLink 首次登录时，adapter 已创建用户，
      // 但 user.type 可能不存在，确保默认为 regular
      if (trigger === "signIn" && !token.type) {
        token.type = "regular";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }
      return session;
    },
  },
});
