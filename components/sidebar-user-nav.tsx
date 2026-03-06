"use client";

import { ChevronUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { guestRegex } from "@/lib/constants";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";

export function SidebarUserNav({ user }: { user: User }) {
  const router = useRouter();
  const { data, status } = useSession();
  const [showGuestLogoutDialog, setShowGuestLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isGuest = guestRegex.test(data?.user?.email ?? user?.email ?? "");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton className="h-10 justify-between bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex flex-row gap-2">
                  <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
                  <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                    加载中
                  </span>
                </div>
                <div className="animate-spin text-zinc-500">
                  <LoaderIcon />
                </div>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                data-testid="user-nav-button"
              >
                {/* biome-ignore lint: WSL2 workaround - Next.js Image resolves to private IP */}
                <img
                  alt={user.email ?? "User Avatar"}
                  className="size-6 rounded-full"
                  src={`https://api.dicebear.com/9.x/fun-emoji/svg?seed=${user.email}`}
                />
                <span className="truncate" data-testid="user-email">
                  {isGuest ? "访客" : user?.email}
                </span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width)"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem asChild data-testid="user-nav-item-auth">
              <button
                className="w-full cursor-pointer"
                disabled={isLoggingOut}
                onClick={() => {
                  if (status === "loading" || isLoggingOut) {
                    toast({
                      type: "error",
                      description: "正在检查登录状态，请稍后重试！",
                    });

                    return;
                  }

                  setIsLoggingOut(true);

                  if (isGuest) {
                    router.push("/login");
                  } else {
                    signOut({
                      redirectTo: "/",
                    });
                  }
                }}
                type="button"
              >
                {isLoggingOut ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    处理中...
                  </span>
                ) : isGuest ? (
                  "登录账户"
                ) : (
                  "退出登录"
                )}
              </button>
            </DropdownMenuItem>
            {isGuest && (
              <>
                <DropdownMenuItem
                  asChild
                  data-testid="user-nav-item-guest-clear"
                >
                  <button
                    className="w-full cursor-pointer"
                    onClick={() => setShowGuestLogoutDialog(true)}
                    type="button"
                  >
                    退出访客
                  </button>
                </DropdownMenuItem>
                <div className="px-2 py-1.5 text-muted-foreground text-xs">
                  访客模式下数据不会长期保存，建议登录账户
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <AlertDialog
        onOpenChange={setShowGuestLogoutDialog}
        open={showGuestLogoutDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出访客模式？</AlertDialogTitle>
            <AlertDialogDescription>
              退出后，访客模式下的聊天记录将无法恢复。如需保存数据，请先登录账户。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                signOut({
                  redirectTo: "/",
                });
              }}
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenu>
  );
}
