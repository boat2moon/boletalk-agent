"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { guestRegex } from "@/lib/constants";
import { LoaderIcon } from "./icons";

export function HeaderUserNav() {
  const router = useRouter();
  const { data, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const [showGuestLogoutDialog, setShowGuestLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isGuest = guestRegex.test(data?.user?.email ?? "");

  // Base64 encoded user icons: dark for light mode, light for dark mode
  const userIconDark =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxYTFhMWEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgMjF2LTJhNCA0IDAgMCAwLTQtNEg4YTQgNCAwIDAgMC00IDR2MiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIvPjwvc3ZnPg==";
  const userIconLight =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmNWY1ZjUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgMjF2LTJhNCA0IDAgMCAwLTQtNEg4YTQgNCAwIDAgMC00IDR2MiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIvPjwvc3ZnPg==";
  const userIconSrc = resolvedTheme === "dark" ? userIconLight : userIconDark;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2">
        <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
        <div className="animate-spin text-zinc-500">
          <LoaderIcon />
        </div>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <Button asChild>
        <a href="/login">登录</a>
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-9 items-center gap-2"
            data-testid="header-user-nav-button"
            variant="outline"
          >
            <Image
              alt={data.user.email ?? "User Avatar"}
              className="rounded-full"
              height={20}
              src={userIconSrc}
              width={20}
            />
            <span
              className="max-w-[120px] truncate text-sm"
              data-testid="header-user-email"
            >
              {isGuest ? "访客" : data.user.email}
            </span>
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          data-testid="header-user-nav-menu"
        >
          <DropdownMenuItem
            className="cursor-pointer"
            data-testid="header-user-nav-item-theme"
            onSelect={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {`切换至${resolvedTheme === "light" ? "深色" : "浅色"}模式`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild data-testid="header-user-nav-item-auth">
            <button
              className="w-full cursor-pointer"
              disabled={isLoggingOut}
              onClick={() => {
                if (isLoggingOut) {
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
                data-testid="header-user-nav-item-guest-clear"
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
    </>
  );
}
