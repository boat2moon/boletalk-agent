"use client";

/**
 * 阶段3：面试总结页面
 *
 * 面试结束后展示：
 * - 面试时长
 * - 完整的对话记录（transcript）
 * - 简历分析结果（如有）
 * - 操作按钮（再来一次 / 查看历史）
 */

import { Clock, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumeAnalysis } from "@/lib/ai/agent/resume-analyze";
import type { TranscriptEntry } from "./realtime-page";

export function InterviewSummary({
  transcript,
  callDuration,
  resumeAnalysis,
  onNewInterview,
}: {
  transcript: TranscriptEntry[];
  callDuration: number;
  resumeAnalysis: ResumeAnalysis | null;
  onNewInterview: () => void;
}) {
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m} 分 ${s} 秒`;
  };

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
        <Button
          className="flex-1"
          onClick={onNewInterview}
          variant="outline"
        >
          <RotateCcw className="mr-2" size={16} />
          再来一次
        </Button>
      </div>
    </div>
  );
}
