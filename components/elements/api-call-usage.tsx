/**
 * API 调用次数显示组件
 *
 * 在输入框右侧显示一个圆形进度指示器，
 * 展示用户今天已使用的 API 调用次数 / 每日上限。
 *
 * 使用 SVG 圆环实现进度条效果。
 * 通过 /api/chat/usage 接口获取使用数据。
 */

"use client";

import { useEffect, useState } from "react";

/**
 * API 调用次数 hook
 *
 * 定期从后端获取使用情况数据。
 * 出于简单考虑，组件首次挂载时获取一次，
 * 之后通过 refreshKey 触发刷新。
 */
function useApiCallUsage(_refreshKey?: number) {
  const [usage, setUsage] = useState<{ used: number; max: number } | null>(
    null
  );

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch("/api/chat/usage");
        if (res.ok) {
          const data = await res.json();
          setUsage(data);
        }
      } catch (err) {
        console.warn("Failed to fetch API usage", err);
      }
    }
    fetchUsage();
  }, []);

  return usage;
}

/**
 * 圆环进度指示器组件
 *
 * 显示格式：圆环 + "已用/上限"
 * - 绿色：使用率 < 50%
 * - 黄色：使用率 50-80%
 * - 红色：使用率 > 80%
 */
export function ApiCallUsage({ refreshKey }: { refreshKey?: number }) {
  const usage = useApiCallUsage(refreshKey);

  // 加载中：渲染同尺寸占位，防止 CLS
  if (!usage) {
    return (
      <div
        className="flex items-center gap-1"
        style={{ width: 28, height: 28 }}
      />
    );
  }

  const { used, max } = usage;
  const ratio = max > 0 ? used / max : 0;

  // 圆环参数
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  // 根据使用率选择颜色
  let color = "#22c55e"; // 绿色
  if (ratio >= 0.8) {
    color = "#ef4444"; // 红色
  } else if (ratio >= 0.5) {
    color = "#eab308"; // 黄色
  }

  return (
    <div
      className="flex items-center gap-1"
      title={`今日已使用 ${used}/${max} 次`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="-rotate-90"
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          width={size}
        >
          {/* 背景圆环 */}
          <circle
            className="text-muted-foreground/20"
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          {/* 进度圆环 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-medium"
          style={{ fontSize: 8, color }}
        >
          {used}
        </span>
      </div>
    </div>
  );
}
