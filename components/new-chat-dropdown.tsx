"use client";

import { LockIcon } from "lucide-react";
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
  disabled?: boolean;
}[] = [
  { value: "text", label: "纯文本" },
  { value: "voice", label: "基础语音" },
  { value: "realtime", label: "高级语音", disabled: true },
  { value: "avatar", label: "数字人面试官", disabled: true },
];

export function NewChatDropdown({
  onNewChat,
  className,
}: {
  onNewChat: (mode: VoiceMode) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className={className ?? "h-8 p-1 md:h-fit md:p-2"}
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
        {NEW_CHAT_MODES.map((mode) => (
          <DropdownMenuItem
            className={mode.disabled ? "opacity-40" : ""}
            disabled={mode.disabled}
            key={mode.value}
            onClick={() => {
              if (!mode.disabled) {
                onNewChat(mode.value);
              }
            }}
          >
            <span>{mode.label}</span>
            {mode.disabled && (
              <LockIcon className="ml-auto opacity-50" size={12} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
