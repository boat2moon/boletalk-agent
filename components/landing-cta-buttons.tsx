"use client";

import { ArrowRight, Loader2, Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LandingCtaButtons() {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"login" | "guest" | null>(
    null
  );

  const handleLogin = () => {
    setLoadingAction("login");
    router.push("/login");
  };

  const handleGuest = () => {
    setLoadingAction("guest");
    router.push("/api/auth/guest?redirectUrl=/chat");
  };

  const isDisabled = loadingAction !== null;

  return (
    <>
      <Button
        className="w-full cursor-pointer bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
        disabled={isDisabled}
        onClick={handleLogin}
        size="lg"
      >
        {loadingAction === "login" ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            跳转中...
          </>
        ) : (
          <>
            登录 / 注册
            <ArrowRight className="ml-2 size-4" />
          </>
        )}
      </Button>
      <Button
        className="w-full cursor-pointer bg-transparent sm:w-auto"
        disabled={isDisabled}
        onClick={handleGuest}
        size="lg"
        variant="outline"
      >
        {loadingAction === "guest" ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            正在进入...
          </>
        ) : (
          <>
            访客登录
            <UserPlus className="ml-2 size-4" />
          </>
        )}
      </Button>
      <Button
        asChild
        className="w-full cursor-pointer bg-transparent sm:w-auto"
        disabled={isDisabled}
        size="lg"
        variant="outline"
      >
        <a
          href="https://boat2moon.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          联系开发者
          <Mail className="ml-2 size-4" />
        </a>
      </Button>
    </>
  );
}
