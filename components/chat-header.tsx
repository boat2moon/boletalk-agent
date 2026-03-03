"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { memo } from "react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { ModeSelector } from "./mode-selector";
import { NewChatDropdown } from "./new-chat-dropdown";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";
import { useVoiceMode } from "./voice-mode-context";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  hasActiveChat,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  hasActiveChat?: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { setVoiceMode } = useVoiceMode();
  const { setTheme, resolvedTheme } = useTheme();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <div className="order-2 ml-auto md:order-1 md:ml-0">
          <NewChatDropdown
            className="h-8 px-2 md:h-fit md:px-2"
            onNewChat={(mode) => {
              setVoiceMode(mode);
              // biome-ignore lint/suspicious/noDocumentCookie: intentional client-side cookie for model reset
              document.cookie = `chat-model=chat-model-glm; path=/; max-age=${60 * 60 * 24 * 365}`;
              router.push("/chat");
              router.refresh();
            }}
          />
        </div>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {/* 模式选择器（与下方对话区域居中对齐） */}
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
        <div className="pointer-events-auto">
          <ModeSelector hasActiveChat={hasActiveChat} />
        </div>
      </div>

      <Button
        className="order-4 ml-auto hidden cursor-pointer md:flex md:h-fit"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        variant="outline"
      >
        {resolvedTheme === "light" ? (
          <MoonIcon size={16} />
        ) : (
          <SunIcon size={16} />
        )}
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.hasActiveChat === nextProps.hasActiveChat
  );
});
