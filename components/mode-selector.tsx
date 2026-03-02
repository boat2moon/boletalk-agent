"use client";

import { LockIcon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
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
  disabled?: boolean;
};

const MODE_OPTIONS: ModeOption[] = [
  { value: "text", label: "纯文本", shortLabel: "文本" },
  { value: "voice", label: "基础语音", shortLabel: "语音" },
  { value: "realtime", label: "高级语音", shortLabel: "高级", disabled: true },
  { value: "avatar", label: "数字人", shortLabel: "数字人", disabled: true },
];

function PureModeSelector() {
  const { voiceMode, setVoiceMode } = useVoiceMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

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
        className="absolute top-1 bottom-1 rounded-lg bg-background shadow-md ring-1 ring-border/50 transition-all duration-300 ease-in-out"
        style={{
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`,
        }}
      />

      {MODE_OPTIONS.map((option) => {
        const isActive = voiceMode === option.value;

        const button = (
          <button
            className={`relative z-10 flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium text-sm transition-colors duration-200 ${
              isActive
                ? "text-foreground"
                : option.disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "cursor-pointer text-muted-foreground hover:text-foreground/70"
            }
            `}
            data-mode-btn
            disabled={option.disabled}
            key={option.value}
            onClick={() => {
              if (!option.disabled) {
                setVoiceMode(option.value);
              }
            }}
            type="button"
          >
            <span className="hidden sm:inline">{option.label}</span>
            <span className="sm:hidden">{option.shortLabel}</span>
            {option.disabled && <LockIcon className="opacity-50" size={10} />}
          </button>
        );

        if (option.disabled) {
          return (
            <TooltipProvider delayDuration={0} key={option.value}>
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>即将推出</p>
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
