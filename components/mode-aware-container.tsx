"use client";

/**
 * 模式感知容器
 *
 * 根据当前 voiceMode 决定渲染哪个组件：
 * - text / voice → 渲染常规 Chat 组件（由父组件传入 children）
 * - realtime → 渲染 RealtimePage（电话面试准备 + 通话 + 总结）
 * - avatar → 渲染 AvatarPage（数字人面试准备 + 会话 + 总结）
 *
 * ChatHeader 由此组件统一渲染，确保在模式切换时不被卸载重载，
 * 从而保持 ModeSelector 的滑动动画连贯性。
 */

import { cloneElement, type ReactElement, useCallback, useState } from "react";
import { AvatarPage } from "@/components/avatar/avatar-page";
import { ChatHeader } from "@/components/chat-header";
import { RealtimePage } from "@/components/realtime/realtime-page";
import type { VisibilityType } from "@/components/visibility-selector";
import { useVoiceMode } from "@/components/voice-mode-context";

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
  const [evaluationLocked, setEvaluationLocked] = useState(false);

  const handleHasActiveChatChange = useCallback((hasActive: boolean) => {
    setHasActiveChat(hasActive);
  }, []);

  const handleEvaluationLockChange = useCallback((locked: boolean) => {
    setEvaluationLocked(locked);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        chatId={chatId}
        evaluationLocked={evaluationLocked}
        hasActiveChat={hasActiveChat}
        isReadonly={isReadonly}
        selectedVisibilityType={selectedVisibilityType}
      />

      {voiceMode === "avatar" ? (
        <AvatarPage
          hideHeader
          onHasActiveChatChange={handleHasActiveChatChange}
        />
      ) : voiceMode === "realtime" ? (
        <RealtimePage
          hideHeader
          onHasActiveChatChange={handleHasActiveChatChange}
        />
      ) : (
        // text / voice 模式：克隆子元素并注入 hideHeader + callback
        cloneElement(children, {
          hideHeader: true,
          onHasActiveChatChange: handleHasActiveChatChange,
          onEvaluationLockChange: handleEvaluationLockChange,
        })
      )}
    </div>
  );
}
