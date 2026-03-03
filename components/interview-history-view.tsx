"use client";

/**
 * 面试历史记录展示组件
 *
 * 用于 /chat/[id] 页面在 chatType 为 realtime 或 avatar 时展示只读的面试总结。
 * 复用了 InterviewSummary 的 UI 布局风格。
 */

import { Clock, MessageSquare, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatHeader } from "@/components/chat-header";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

export function InterviewHistoryView({
  chatId,
  chatType,
  messages,
  durationSeconds,
}: {
  chatId: string;
  chatType: "realtime" | "avatar";
  messages: ChatMessage[];
  /** 面试时长（秒），由服务端从消息时间戳计算 */
  durationSeconds: number;
}) {
  const router = useRouter();

  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationSecs = durationSeconds % 60;

  const modeLabel = chatType === "realtime" ? "电话面试" : "视频面试";

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader
        chatId={chatId}
        hasActiveChat={true}
        isReadonly={true}
        selectedVisibilityType="private"
      />

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
              <Clock className="text-primary" size={20} />
              <div>
                <p className="text-muted-foreground text-xs">面试时长</p>
                <p className="font-semibold">
                  {durationSeconds > 0 || durationMinutes > 0
                    ? `${durationMinutes} 分 ${durationSecs} 秒`
                    : "未记录"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
              <MessageSquare className="text-primary" size={20} />
              <div>
                <p className="text-muted-foreground text-xs">对话轮次</p>
                <p className="font-semibold">{messages.length} 条</p>
              </div>
            </div>
          </div>

          {/* 对话记录 */}
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-semibold text-sm">💬 对话记录</h3>
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无对话记录</p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => {
                  const text = msg.parts
                    .filter((p) => p.type === "text")
                    .map((p) => ("text" in p ? p.text : ""))
                    .join("");
                  if (!text) {
                    return null;
                  }
                  return (
                    <div
                      className={`text-sm ${
                        msg.role === "assistant"
                          ? "text-primary"
                          : "text-foreground"
                      }`}
                      key={`history-${msg.id}-${i}`}
                    >
                      <span className="mr-1.5 font-medium">
                        {msg.role === "assistant" ? "面试官" : "你"}：
                      </span>
                      {text}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex gap-3 border-t bg-background px-4 py-4">
        <Button
          className="flex-1"
          onClick={() => router.push("/chat")}
          variant="outline"
        >
          <RotateCcw className="mr-2" size={16} />
          开始新{modeLabel}
        </Button>
      </div>
    </div>
  );
}
