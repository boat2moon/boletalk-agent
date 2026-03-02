"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCircleFillIcon, WarningIcon } from "./icons";

const iconsByType: Record<"success" | "error", ReactNode> = {
  success: <CheckCircleFillIcon />,
  error: <WarningIcon />,
};

export function toast(props: Omit<ToastProps, "id">) {
  return sonnerToast.custom(
    (id) => (
      <Toast description={props.description} id={id} type={props.type} />
    ),
    // error 类型不自动消失
    props.type === "error" ? { duration: Infinity } : undefined
  );
}

function Toast(props: ToastProps) {
  const { id, type, description } = props;

  const descriptionRef = useRef<HTMLDivElement>(null);
  const [multiLine, setMultiLine] = useState(false);

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
      const lines = Math.round(el.scrollHeight / lineHeight);
      setMultiLine(lines > 1);
    };

    update(); // initial check
    const ro = new ResizeObserver(update); // re-check on width changes
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex toast-mobile:w-[356px] w-full justify-center">
      <div
        className={cn(
          "flex toast-mobile:w-fit w-full flex-col gap-2 rounded-lg bg-zinc-100 p-3"
        )}
        data-testid="toast"
        key={id}
      >
        <div
          className={cn(
            "flex flex-row gap-3",
            multiLine ? "items-start" : "items-center"
          )}
        >
          <div
            className={cn(
              "data-[type=error]:text-red-600 data-[type=success]:text-green-600",
              { "pt-1": multiLine }
            )}
            data-type={type}
          >
            {iconsByType[type]}
          </div>
          <div className="text-sm text-zinc-950" ref={descriptionRef}>
            {description}
          </div>
        </div>

        {/* error 类型显示操作按钮 */}
        {type === "error" && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <a
              className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
              href="https://www.boat2moon.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              联系管理员
            </a>
            <button
              className="rounded-md bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 transition-colors cursor-pointer"
              onClick={() => sonnerToast.dismiss(id)}
              type="button"
            >
              确定
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type ToastProps = {
  id: string | number;
  type: "success" | "error";
  description: string;
};
