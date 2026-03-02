"use client";

/**
 * 模式感知容器
 *
 * 根据当前 voiceMode 决定渲染哪个组件：
 * - text / voice → 渲染常规 Chat 组件（由父组件传入 children）
 * - realtime → 渲染 RealtimePage（电话面试准备 + 通话 + 总结）
 * - avatar → 渲染 AvatarPage（未来实现）
 *
 * ChatHeader 由此组件统一渲染，确保在模式切换时不被卸载重载，
 * 从而保持 ModeSelector 的滑动动画连贯性。
 */

import {
  type ReactElement,
  cloneElement,
  useCallback,
  useState,
} from "react";
import { ChatHeader } from "@/components/chat-header";
import { useVoiceMode } from "@/components/voice-mode-context";
import { RealtimePage } from "@/components/realtime/realtime-page";
import type { VisibilityType } from "@/components/visibility-selector";

export function ModeAwareContainer({
  children,
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  children: ReactElement;
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { voiceMode } = useVoiceMode();
  const [hasActiveChat, setHasActiveChat] = useState(false);

  const handleHasActiveChatChange = useCallback((hasActive: boolean) => {
    setHasActiveChat(hasActive);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        chatId={chatId}
        hasActiveChat={hasActiveChat}
        isReadonly={isReadonly}
        selectedVisibilityType={selectedVisibilityType}
      />

      {voiceMode === "realtime" ? (
        <RealtimePage
          hideHeader
          onHasActiveChatChange={handleHasActiveChatChange}
        />
      ) : (
        // text / voice 模式：克隆子元素并注入 hideHeader + callback
        cloneElement(children, {
          hideHeader: true,
          onHasActiveChatChange: handleHasActiveChatChange,
        })
      )}
    </div>
  );
}
