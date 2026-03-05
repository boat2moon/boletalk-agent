"use client";

/**
 * 职位 JD 模板选择器
 *
 * 两种展示模式：
 * 1. compact（紧凑）：DropdownMenu 下拉选择器 + AlertDialog 弹窗输入自定义 JD
 * 2. full（完整）：网格卡片 + 单个带 max-height 文本框
 */

import { Briefcase, ChevronDown, FileEdit } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { JOB_TEMPLATES } from "@/lib/ai/job-templates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type JobTemplateSelectorProps = {
  /** 当前选中的模板 ID（undefined = 未选择，"custom" = 自定义） */
  selectedTemplate?: string;
  /** 自定义 JD 文本 */
  customJD?: string;
  /** 模板变更回调 */
  onTemplateChange: (templateId?: string, customJD?: string) => void;
  /** 展示模式 */
  variant?: "compact" | "full";
};

// ==================== 紧凑模式（DropdownMenu + Dialog） ====================

function CompactSelector({
  selectedTemplate,
  customJD,
  onTemplateChange,
}: Omit<JobTemplateSelectorProps, "variant">) {
  // Optimistic local state —— 点击立即更新 UI，不等父组件 re-render
  const [localTemplate, setLocalTemplate] = useState(selectedTemplate);
  const [_localCustomJD, setLocalCustomJD] = useState(customJD || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftJD, setDraftJD] = useState(customJD || "");

  // 同步外部 prop → 本地 state（父组件重置时跟随）
  useEffect(() => {
    setLocalTemplate(selectedTemplate);
  }, [selectedTemplate]);

  useEffect(() => {
    if (customJD !== undefined) {
      setLocalCustomJD(customJD);
      setDraftJD(customJD);
    }
  }, [customJD]);

  const selected = JOB_TEMPLATES.find((t) => t.id === localTemplate);
  const _hasSelection = !!localTemplate;

  const handleSelect = useCallback(
    (templateId?: string, jd?: string) => {
      // 立即更新本地状态（即时反馈）
      setLocalTemplate(templateId);
      if (jd !== undefined) {
        setLocalCustomJD(jd);
      }
      // 异步通知父组件
      onTemplateChange(templateId, jd);
    },
    [onTemplateChange]
  );

  const _handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handleSelect(undefined);
    },
    [handleSelect]
  );

  const triggerLabel = selected
    ? selected.label
    : localTemplate === "custom"
      ? "自定义 JD"
      : "选择岗位";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-7 gap-1 px-2 text-xs focus-visible:ring-0"
            size="sm"
            variant="outline"
          >
            <Briefcase className="size-3.5" />
            <span className="hidden font-medium text-xs sm:inline">
              {triggerLabel}
            </span>
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {JOB_TEMPLATES.map((template) => (
            <DropdownMenuItem
              className={
                localTemplate === template.id
                  ? "bg-primary/10 text-primary"
                  : ""
              }
              key={template.id}
              onSelect={() => handleSelect(template.id)}
            >
              <span className="mr-2">{template.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{template.label}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {template.brief}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={
              localTemplate === "custom" ? "bg-primary/10 text-primary" : ""
            }
            onSelect={() => {
              setDialogOpen(true);
            }}
          >
            <FileEdit className="mr-2 size-4" />
            <span className="font-medium text-sm">自定义 JD</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 自定义 JD 弹窗 */}
      <AlertDialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>自定义职位描述</AlertDialogTitle>
            <AlertDialogDescription>
              输入目标岗位的技术栈、职责要求等，面试官将围绕这些内容提问。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => setDraftJD(e.target.value)}
            placeholder="例如：负责公司核心业务系统前端开发，要求熟悉 React/TypeScript/Next.js，具备性能优化经验..."
            rows={5}
            style={{ maxHeight: 200, resize: "vertical" }}
            value={draftJD}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!draftJD.trim()}
              onClick={() => handleSelect("custom", draftJD.trim())}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ==================== 完整模式（网格卡片 + 单个输入框） ====================

function FullSelector({
  selectedTemplate,
  customJD,
  onTemplateChange,
}: Omit<JobTemplateSelectorProps, "variant">) {
  const [localCustomJD, setLocalCustomJD] = useState(customJD || "");

  return (
    <div className="w-full max-w-md">
      <span className="mb-2 block font-medium text-sm">
        选择岗位方向（可选）
      </span>
      <div className="grid grid-cols-2 gap-2">
        {JOB_TEMPLATES.map((template) => (
          <button
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
              selectedTemplate === template.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/50"
            }`}
            key={template.id}
            onClick={() => {
              onTemplateChange(
                selectedTemplate === template.id ? undefined : template.id
              );
            }}
            type="button"
          >
            <span className="text-lg">{template.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{template.label}</p>
              <p className="truncate text-muted-foreground text-xs">
                {template.brief}
              </p>
            </div>
          </button>
        ))}
      </div>
      {/* 自定义 JD 文本框（始终显示） */}
      <textarea
        className="mt-3 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        onChange={(e) => {
          setLocalCustomJD(e.target.value);
          if (e.target.value.trim()) {
            onTemplateChange("custom", e.target.value);
          } else if (selectedTemplate === "custom") {
            onTemplateChange(undefined);
          }
        }}
        onFocus={() => {
          if (localCustomJD.trim() && selectedTemplate !== "custom") {
            onTemplateChange("custom", localCustomJD);
          }
        }}
        placeholder="或直接输入自定义职位描述..."
        rows={2}
        style={{ maxHeight: 120, resize: "vertical" }}
        value={selectedTemplate === "custom" ? localCustomJD : ""}
      />
    </div>
  );
}

// ==================== 统一导出 ====================

export function JobTemplateSelector({
  variant = "compact",
  ...props
}: JobTemplateSelectorProps) {
  return variant === "compact" ? (
    <CompactSelector {...props} />
  ) : (
    <FullSelector {...props} />
  );
}
