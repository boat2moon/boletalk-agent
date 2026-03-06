"use client";

import { LockIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";
import { guestRegex } from "@/lib/constants";
import { PlusIcon } from "./icons";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { VoiceMode } from "./voice-mode-context";

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

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
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
                  setOpen(false);
                  // blur 按钮以清除 focus/选中样式
                  triggerRef.current?.blur();
                  onNewChat(mode.value);
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
  );
}
