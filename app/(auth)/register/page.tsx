"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";
import { SiGithub } from "@icons-pack/react-simple-icons";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { type RegisterActionState, register } from "../actions";

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    {
      status: "idle",
    }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "error", description: "该邮箱已被注册！" });
    } else if (state.status === "failed") {
      toast({ type: "error", description: "注册失败，请稍后重试！" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "请输入有效的邮箱和密码！",
      });
    } else if (state.status === "success") {
      toast({ type: "success", description: "注册成功！" });

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

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">注册</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            创建账号开始使用
          </p>
        </div>

        {/* GitHub 注册 */}
        <div className="flex flex-col gap-3 px-4 sm:px-16">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleGitHubLogin}
          >
            <SiGithub className="size-4" />
            使用 GitHub 注册
          </Button>
        </div>

        {/* 分割线 */}
        <div className="flex items-center gap-3 px-4 sm:px-16">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">或使用邮箱密码</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* 邮箱密码注册 */}
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>注册</SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {"已有账号？ "}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/login"
            >
              去登录
            </Link>
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
