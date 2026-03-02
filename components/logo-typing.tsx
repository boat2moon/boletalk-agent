"use client";

import { useEffect, useState } from "react";
import { BoleTalkIcon } from "@/components/icons/boletalk-icon";

const FULL_TEXT = "伯乐 Talk";
const TYPING_SPEED = 150; // ms per character
const DELETE_SPEED = 100;
const PAUSE_AFTER_TYPE = 2000;
const PAUSE_AFTER_DELETE = 800;

export function LogoTyping() {
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      // 打字阶段
      if (displayText.length < FULL_TEXT.length) {
        timer = setTimeout(() => {
          setDisplayText(FULL_TEXT.slice(0, displayText.length + 1));
        }, TYPING_SPEED);
      } else {
        // 打完了，停顿后开始删除
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, PAUSE_AFTER_TYPE);
      }
    } else {
      // 删除阶段
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(FULL_TEXT.slice(0, displayText.length - 1));
        }, DELETE_SPEED);
      } else {
        // 删完了，停顿后重新开始
        timer = setTimeout(() => {
          setIsDeleting(false);
        }, PAUSE_AFTER_DELETE);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting]);

  return (
    <div className="flex items-center justify-center gap-4 pt-19">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-3xl" />
        <BoleTalkIcon className="relative size-20 text-blue-600/90 drop-shadow-lg md:size-24" />
      </div>
      <span className="font-bold text-3xl tracking-tight text-blue-600/90 md:text-4xl">
        {displayText}
        <span className="ml-0.5 animate-pulse">
          |
        </span>
      </span>
    </div>
  );
}
