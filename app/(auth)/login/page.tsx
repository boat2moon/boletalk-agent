"use client";

import { SiGithub } from "@icons-pack/react-simple-icons";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LoginActionState, login } from "../actions";

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({
        type: "error",
        description: "邮箱或密码错误！",
      });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "请输入有效的邮箱和密码！",
      });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.push("/chat");
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  const handleGitHubLogin = () => {
    signIn("github", { callbackUrl: "/chat" });
  };

  const handleMagicLink = async () => {
    if (!magicLinkEmail) {
      toast({ type: "error", description: "请输入邮箱地址！" });
      return;
    }
    try {
      await signIn("nodemailer", {
        email: magicLinkEmail,
        callbackUrl: "/chat",
        redirect: false,
      });
      toast({
        type: "success",
        description: "验证邮件已发送，请查收邮箱！",
      });
    } catch {
      toast({ type: "error", description: "发送验证邮件失败，请稍后重试！" });
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">登录</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            使用邮箱密码或第三方账号登录
          </p>
        </div>

        {/* GitHub 登录 */}
        <div className="flex flex-col gap-3 px-4 sm:px-16">
          <Button
            className="w-full gap-2"
            onClick={handleGitHubLogin}
            variant="outline"
          >
            <SiGithub className="size-4" />
            GitHub 登录
          </Button>

          {/* Magic Link 邮箱登录 */}
          {showMagicLink ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Label className="text-sm text-zinc-600 dark:text-zinc-400">
                输入邮箱，接收登录链接
              </Label>
              <Input
                className="bg-muted text-md md:text-sm"
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                placeholder="your@email.com"
                type="email"
                value={magicLinkEmail}
              />
              <Button className="w-full" onClick={handleMagicLink}>
                发送登录链接
              </Button>
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              onClick={() => setShowMagicLink(true)}
              variant="outline"
            >
              <Mail className="size-4" />
              邮箱免密登录
            </Button>
          )}
        </div>

        {/* 分割线 */}
        <div className="flex items-center gap-3 px-4 sm:px-16">
          <div className="h-px flex-1 bg-border" />
          <span className="text-muted-foreground text-xs">或使用邮箱密码</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* 邮箱密码登录 */}
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>登录</SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {"还没有账号？ "}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/register"
            >
              免费注册
            </Link>
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
