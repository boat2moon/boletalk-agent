import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcrypt-ts";
import { drizzle } from "drizzle-orm/postgres-js";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Email from "next-auth/providers/nodemailer";

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
