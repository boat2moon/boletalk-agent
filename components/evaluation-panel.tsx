"use client";

/**
 * 面试评估右侧栏面板（Text/Voice 模式专用）
 *
 * 布局面板：占据右侧空间，推动聊天区域左移（类似左侧栏的镜像效果）。
 * - 顶部「← 继续对话」按钮关闭面板
 * - 内嵌 EvaluationCard
 */

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EvaluationCard,
  type EvaluationData,
  EvaluationLoading,
} from "./evaluation-card";

type EvaluationPanelProps = {
  /** 是否显示面板 */
  isVisible: boolean;
  /** 评估数据（null = 加载中） */
  data: EvaluationData | null;
  /** 关闭面板并恢复输入 */
  onClose: () => void;
  /** 评估生成错误消息 */
  error?: string | null;
};

export function EvaluationPanel({
  isVisible,
  data,
  onClose,
  error,
}: EvaluationPanelProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          animate={{ width: 420, opacity: 1 }}
          className="flex h-dvh shrink-0 flex-col overflow-hidden border-l bg-background"
          exit={{ width: 0, opacity: 0 }}
          initial={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* 顶部操作栏 */}
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="whitespace-nowrap font-semibold text-sm">
              面试评估
            </h3>
            <Button
              className="gap-1.5 whitespace-nowrap font-semibold"
              onClick={onClose}
              size="default"
              variant="default"
            >
              <ArrowLeft className="size-4" />
              继续对话
            </Button>
          </div>

          {/* 内容区域 */}
          <div className="min-w-[380px] flex-1 overflow-y-auto px-4 py-6">
            {error ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <X className="size-10 text-destructive" />
                <p className="text-destructive text-sm">{error}</p>
                <Button onClick={onClose} size="sm" variant="outline">
                  关闭
                </Button>
              </div>
            ) : data ? (
              <EvaluationCard data={data} />
            ) : (
              <EvaluationLoading />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
