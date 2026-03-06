"use client";

import { LockIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";
import { guestRegex } from "@/lib/constants";
import { PlusIcon } from "./icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { VoiceMode } from "./voice-mode-context";
import { useVoiceMode } from "./voice-mode-context";

const NEW_CHAT_MODES: {
  value: VoiceMode;
  label: string;
}[] = [
  { value: "text", label: "纯文本" },
  { value: "voice", label: "基础语音" },
  { value: "realtime", label: "电话面试" },
  { value: "avatar", label: "视频面试" },
];

export function NewChatDropdown({
  onNewChat,
  className,
}: {
  onNewChat: (mode: VoiceMode) => void;
  className?: string;
}) {
  const { data: session } = useSession();
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { isSessionActive, requestEndSession } = useVoiceMode();
  /** 等待用户确认的模式 */
  const [pendingMode, setPendingMode] = useState<VoiceMode | null>(null);

  const handleSelectMode = (mode: VoiceMode) => {
    setOpen(false);
    triggerRef.current?.blur();

    if (isSessionActive) {
      // 面试进行中 → 弹出二次确认
      setPendingMode(mode);
    } else {
      onNewChat(mode);
    }
  };

  const handleConfirmEnd = async () => {
    if (requestEndSession) {
      await requestEndSession();
    }
    if (pendingMode) {
      onNewChat(pendingMode);
    }
    setPendingMode(null);
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          // Radix 关闭菜单后会自动 refocus trigger，延迟 blur 以取消选中态
          if (!isOpen) {
            setTimeout(() => triggerRef.current?.blur(), 0);
          }
        }}
        open={open}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className={className ?? "h-8 p-1 md:h-fit md:p-2"}
                ref={triggerRef}
                type="button"
                variant="ghost"
              >
                <PlusIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent align="end" className="hidden md:block">
            新建会话
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {NEW_CHAT_MODES.map((mode) => {
            const isBlocked = isGuest && mode.value === "avatar";
            return (
              <DropdownMenuItem
                className={isBlocked ? "opacity-40" : ""}
                disabled={isBlocked}
                key={mode.value}
                onClick={() => {
                  if (!isBlocked) {
                    handleSelectMode(mode.value);
                  }
                }}
              >
                <span>{mode.label}</span>
                {isBlocked && (
                  <span className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
                    请先登录
                    <LockIcon className="opacity-50" size={12} />
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 面试进行中结束确认弹窗 */}
      <AlertDialog
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingMode(null);
          }
        }}
        open={!!pendingMode}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>面试正在进行中</AlertDialogTitle>
            <AlertDialogDescription>
              当前有正在进行的面试，新建会话将结束当前面试并保存记录。确定要结束吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续面试</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEnd}>
              结束并新建
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
