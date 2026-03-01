"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/toast";

/**
 * 检测 URL 中的 guest_expired 参数，显示访客过期提示
 * 并自动清除 URL 参数
 */
export function GuestExpiredToast() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("guest_expired") === "true") {
      toast({
        type: "success",
        description:
          "您的访客身份已过期（7天），已为您创建新的访客账户。之前的聊天记录已被清理。",
      });
      // 清除 URL 参数，避免刷新再次弹出
      router.replace("/chat");
    }
  }, [searchParams, router]);

  return null;
}
