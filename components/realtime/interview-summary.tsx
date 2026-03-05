"use client";

/**
 * 阶段3：面试总结页面
 *
 * 面试结束后展示：
 * - 面试时长
 * - 完整的对话记录（transcript）
 * - 简历分析结果（如有）
 * - AI 面试评估（自动生成）
 * - 操作按钮（再来一次 / 查看历史）
 */

import { Clock, MessageSquare, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  EvaluationCard,
  type EvaluationData,
  EvaluationLoading,
} from "@/components/evaluation-card";
import { Button } from "@/components/ui/button";
import type { ResumeAnalysis } from "@/lib/ai/toolkit/resume-analyzer";
import type { TranscriptEntry } from "./realtime-page";

export function InterviewSummary({
  transcript,
  callDuration,
  resumeAnalysis,
  onNewInterview,
  chatId,
}: {
  transcript: TranscriptEntry[];
  callDuration: number;
  resumeAnalysis: ResumeAnalysis | null;
  onNewInterview: () => void;
  /** 当前会话 ID，用于生成/加载评估 */
  chatId?: string;
}) {
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m} 分 ${s} 秒`;
  };

  // ── 面试评估 ──
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(
    null
  );
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const fetchOrGenerateEvaluation = useCallback(async () => {
    if (!chatId) {
      return;
    }

    setEvaluationLoading(true);
    try {
      // 先查已有
      const existing = await fetch(`/api/chat/evaluation?chatId=${chatId}`);
      if (existing.ok) {
        const data = await existing.json();
        setEvaluationData(data);
        setEvaluationLoading(false);
        return;
      }

      // 404 则生成新的
      if (existing.status === 404) {
        const res = await fetch("/api/chat/evaluation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
        if (res.ok) {
          const data = await res.json();
          setEvaluationData(data);
        } else {
          const errData = await res.json().catch(() => null);
          setEvaluationError(errData?.error || "评估生成失败");
        }
      }
    } catch {
      setEvaluationError("网络错误，评估加载失败");
    } finally {
      setEvaluationLoading(false);
    }
  }, [chatId]);

  // 挂载时自动生成评估
  useEffect(() => {
    fetchOrGenerateEvaluation();
  }, [fetchOrGenerateEvaluation]);

  return (
    <div className="flex h-full flex-col">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
              <Clock className="text-primary" size={20} />
              <div>
                <p className="text-muted-foreground text-xs">面试时长</p>
                <p className="font-semibold">{formatDuration(callDuration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
              <MessageSquare className="text-primary" size={20} />
              <div>
                <p className="text-muted-foreground text-xs">对话轮次</p>
                <p className="font-semibold">{transcript.length} 条</p>
              </div>
            </div>
          </div>

          {/* AI 面试评估 */}
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-semibold text-sm">📊 面试评估</h3>
            {evaluationLoading ? (
              <EvaluationLoading />
            ) : evaluationError ? (
              <p className="text-destructive text-sm">{evaluationError}</p>
            ) : evaluationData ? (
              <EvaluationCard compact data={evaluationData} />
            ) : null}
          </div>

          {/* 简历分析摘要 */}
          {resumeAnalysis && (
            <div className="rounded-xl border p-4">
              <h3 className="mb-3 font-semibold text-sm">📋 简历分析</h3>
              <p className="mb-2 text-muted-foreground text-sm">
                {resumeAnalysis.summary}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resumeAnalysis.techStack.slice(0, 8).map((tech) => (
                  <span
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-primary text-xs"
                    key={tech}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 对话记录 */}
          <div className="rounded-xl border p-4">
            <h3 className="mb-3 font-semibold text-sm">💬 对话记录</h3>
            {transcript.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无对话记录</p>
            ) : (
              <div className="space-y-3">
                {transcript.map((entry, i) => (
                  <div
                    className={`text-sm ${
                      entry.role === "assistant"
                        ? "text-primary"
                        : "text-foreground"
                    }`}
                    key={`summary-${entry.timestamp}-${i}`}
                  >
                    <span className="mr-1.5 font-medium">
                      {entry.role === "assistant" ? "面试官" : "你"}：
                    </span>
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex gap-3 border-t bg-background px-4 py-4">
        <Button className="flex-1" onClick={onNewInterview} variant="outline">
          <RotateCcw className="mr-2" size={16} />
          再来一次
        </Button>
      </div>
    </div>
  );
}
