"use client";

/**
 * 面试评估卡片组件（通用）
 *
 * 四种模式共用：
 * - Text/Voice: 嵌入 EvaluationPanel 右侧栏
 * - Phone: 嵌入 InterviewSummary 结束页面
 * - Avatar: 嵌入 AvatarPage summary 阶段
 *
 * 使用 recharts RadarChart 绘制雷达图 + 评语卡片
 */

import { CheckCircle2, Lightbulb, Star, TrendingUp } from "lucide-react";
import { useTheme } from "next-themes";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

// ── 类型 ─────────────────────────────────────────────────

export type EvaluationScores = {
  technical: number;
  communication: number;
  logic: number;
  project: number;
  overall: number;
};

export type EvaluationComments = {
  summary: string;
  strengths: string[];
  improvements: string[];
};

export type EvaluationData = {
  scores: EvaluationScores;
  comments: EvaluationComments;
};

// ── 雷达图维度配置（含颜色） ──

const DIMENSIONS: {
  key: keyof Omit<EvaluationScores, "overall">;
  label: string;
  color: string;
}[] = [
  { key: "technical", label: "技术能力", color: "#3b82f6" }, // blue
  { key: "communication", label: "沟通表达", color: "#10b981" }, // emerald
  { key: "logic", label: "逻辑思维", color: "#8b5cf6" }, // violet
  { key: "project", label: "项目理解", color: "#f59e0b" }, // amber
];

// ── 组件 ─────────────────────────────────────────────────

export function EvaluationCard({
  data,
  compact = false,
}: {
  data: EvaluationData;
  /** 紧凑模式（Phone/Avatar 结束页面内嵌时使用） */
  compact?: boolean;
}) {
  const { scores, comments } = data;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // 雷达图数据（不含 overall）
  const radarData = DIMENSIONS.map((dim) => ({
    dimension: dim.label,
    score: scores[dim.key],
    fullMark: 10,
  }));

  return (
    <div className={`space-y-4 ${compact ? "" : "space-y-6"}`}>
      {/* 综合评分 */}
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Star className="size-7 text-primary" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">综合评分</p>
          <p className="font-bold text-3xl text-primary">
            {scores.overall}
            <span className="font-normal text-muted-foreground text-sm">
              /10
            </span>
          </p>
        </div>
      </div>

      {/* 一句话总结 */}
      <p className="text-foreground/80 text-sm leading-relaxed">
        {comments.summary}
      </p>

      {/* 雷达图 — 单色多边形 + 彩色顶点 */}
      <div className={`${compact ? "h-48" : "h-56"}`}>
        <ResponsiveContainer height="100%" width="100%">
          <RadarChart cx="50%" cy="50%" data={radarData} outerRadius="70%">
            <PolarGrid
              stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"}
            />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{
                fill: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.65)",
                fontSize: 12,
                fontWeight: 500,
              }}
            />
            <PolarRadiusAxis axisLine={false} domain={[0, 10]} tick={false} />
            <Radar
              dataKey="score"
              dot={(props: any) => {
                const { cx, cy, index } = props;
                const color = DIMENSIONS[index]?.color ?? "#6366f1";
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    fill={color}
                    key={`dot-${index}`}
                    r={5}
                    stroke={isDark ? "#1f1f1f" : "#fff"}
                    strokeWidth={2}
                  />
                );
              }}
              fill={isDark ? "rgba(99,102,241,0.5)" : "rgba(99,102,241,0.25)"}
              fillOpacity={1}
              name="评分"
              stroke={isDark ? "#818cf8" : "#6366f1"}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 各维度评分条 — 对应颜色 */}
      <div className="space-y-2">
        {DIMENSIONS.map((dim) => (
          <div className="flex items-center gap-3" key={dim.key}>
            <span className="w-16 shrink-0 text-muted-foreground text-xs">
              {dim.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(scores[dim.key] / 10) * 100}%`,
                  backgroundColor: dim.color,
                }}
              />
            </div>
            <span className="w-6 text-right font-medium text-xs">
              {scores[dim.key]}
            </span>
          </div>
        ))}
      </div>

      {/* 优点 */}
      {comments.strengths.length > 0 && (
        <div className="rounded-xl border bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <h4 className="font-medium text-sm">做得好</h4>
          </div>
          <ul className="space-y-1.5">
            {comments.strengths.map((s, i) => (
              <li
                className="relative pl-6 text-muted-foreground text-sm leading-relaxed before:absolute before:left-2 before:text-emerald-500 before:content-['•']"
                key={`s-${s.slice(0, 20)}-${i}`}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 改进建议 */}
      {comments.improvements.length > 0 && (
        <div className="rounded-xl border bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="size-4 text-amber-500" />
            <h4 className="font-medium text-sm">可以更好</h4>
          </div>
          <ul className="space-y-1.5">
            {comments.improvements.map((s, i) => (
              <li
                className="relative pl-6 text-muted-foreground text-sm leading-relaxed before:absolute before:left-2 before:text-amber-500 before:content-['•']"
                key={`i-${s.slice(0, 20)}-${i}`}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 评估加载中状态
 */
export function EvaluationLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative size-12">
        <TrendingUp className="size-12 animate-pulse text-primary" />
      </div>
      <div className="text-center">
        <p className="font-medium text-sm">正在生成面试评估...</p>
        <p className="mt-1 text-muted-foreground text-xs">
          AI 正在分析你的面试表现
        </p>
      </div>
    </div>
  );
}
