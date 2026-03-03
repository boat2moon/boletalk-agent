"use client";

import { LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { memo, useEffect, useRef, useState, useTransition } from "react";
import { guestRegex } from "@/lib/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useVoiceMode, type VoiceMode } from "./voice-mode-context";

type ModeOption = {
  value: VoiceMode;
  label: string;
  shortLabel: string;
};

const MODE_OPTIONS: ModeOption[] = [
  { value: "text", label: "纯文本", shortLabel: "文本" },
  { value: "voice", label: "基础语音", shortLabel: "语音" },
  { value: "realtime", label: "电话面试", shortLabel: "电话" },
  { value: "avatar", label: "视频面试", shortLabel: "视频" },
];

function PureModeSelector({ hasActiveChat }: { hasActiveChat?: boolean }) {
  const { voiceMode, setVoiceMode } = useVoiceMode();
  const { data: session } = useSession();
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });
  // 首次渲染时跳过动画，直接定位到正确位置
  const [enableTransition, setEnableTransition] = useState(false);
  const [, startTransition] = useTransition();

  // 计算滑动指示器的位置
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const activeIndex = MODE_OPTIONS.findIndex(
      (opt) => opt.value === voiceMode
    );
    if (activeIndex < 0) {
      return;
    }

    const buttons =
      containerRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-mode-btn]"
      );
    const activeBtn = buttons[activeIndex];
    if (!activeBtn) {
      return;
    }

    setIndicatorStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });
  }, [voiceMode]);

  // 首帧渲染完成后启用过渡动画
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setEnableTransition(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // 窗口 resize 时重算位置
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) {
        return;
      }
      const activeIndex = MODE_OPTIONS.findIndex(
        (opt) => opt.value === voiceMode
      );
      const buttons =
        containerRef.current.querySelectorAll<HTMLButtonElement>(
          "[data-mode-btn]"
        );
      const activeBtn = buttons[activeIndex];
      if (activeBtn) {
        setIndicatorStyle({
          left: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [voiceMode]);

  return (
    <div
      className="relative flex items-center rounded-xl bg-muted/80 p-1"
      ref={containerRef}
    >
      {/* 滑动背景指示器 */}
      <div
        className={`absolute top-1 bottom-1 rounded-lg bg-[#2979ff]/40 shadow-sm ease-in-out dark:bg-[#00e676]/20 ${
          enableTransition ? "transition-all duration-300" : ""
        }`}
        style={{
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`,
        }}
      />

      {MODE_OPTIONS.map((option) => {
        const isActive = voiceMode === option.value;
        // 访客不允许使用视频面试
        const isGuestBlocked = isGuest && option.value === "avatar";
        // 有活跃会话且非当前模式 → 点击将新建会话
        const isNewChatAction = hasActiveChat && !isActive && !isGuestBlocked;

        const button = (
          <button
            className={`relative z-10 flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium text-sm transition-colors duration-200 ${
              isActive
                ? "text-foreground"
                : isGuestBlocked
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "cursor-pointer text-muted-foreground hover:text-foreground/70"
            }
            `}
            data-mode-btn
            disabled={isGuestBlocked}
            key={option.value}
            onClick={() => {
              if (isGuestBlocked) {
                return;
              }
              if (isNewChatAction) {
                // 先切换模式触发滑动动画，让 React 知道这个状态更新优先级更高
                setVoiceMode(option.value);
                // 使用 startTransition 包裹路由跳转，避免路由切换阻塞 UI 动画渲染
                startTransition(() => {
                  router.push("/chat");
                  router.refresh();
                });
              } else if (!isActive) {
                setVoiceMode(option.value);
              }
            }}
            type="button"
          >
            <span className="hidden sm:inline">{option.label}</span>
            <span className="sm:hidden">{option.shortLabel}</span>
            {isGuestBlocked && <LockIcon className="opacity-50" size={10} />}
          </button>
        );

        // 访客限制 tooltip
        if (isGuestBlocked) {
          return (
            <TooltipProvider delayDuration={0} key={option.value}>
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                  className="z-50 border-zinc-700 bg-zinc-800 text-white"
                  side="bottom"
                >
                  <p>访客不可用，请先登录</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        // 有活跃会话时提示"新建XX会话"
        if (isNewChatAction) {
          return (
            <TooltipProvider delayDuration={0} key={option.value}>
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent
                  className="z-50 border-zinc-700 bg-zinc-800 text-white"
                  side="bottom"
                >
                  <p>新建{option.label}会话</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return button;
      })}
    </div>
  );
}

export const ModeSelector = memo(PureModeSelector);
