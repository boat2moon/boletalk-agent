"use client";

/**
 * 数字人面试准备页面
 *
 * 功能：
 * - 上传简历 PDF（可选）
 * - 点击"开始视频面试"启动数字人会话
 */

import { FileText, Loader2, Upload, Video, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { JobTemplateSelector } from "@/components/job-template-selector";
import { Button } from "@/components/ui/button";

/** 将 PDF 文件读取为 base64 字符串 */
const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(file);
  });

export function AvatarPreparationView({
  onStart,
  bootStatus,
  selectedJobTemplate,
  onJobTemplateChange,
}: {
  onStart: (resumeText?: string) => Promise<void>;
  /** 从 AvatarPage 传入的启动进度文案 */
  bootStatus?: string;
  selectedJobTemplate?: string;
  onJobTemplateChange?: (templateId?: string) => void;
}) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 处理文件上传 */
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (file.type !== "application/pdf") {
        toast.error("仅支持 PDF 格式的文件");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("文件过大，请上传 5MB 以内的 PDF 文件");
        return;
      }

      setResumeFile(file);

      try {
        const base64 = await readFileAsBase64(file);
        setResumeText(base64);
      } catch (err) {
        toast.error("文件读取失败");
        console.error(err);
      }
    },
    []
  );

  /** 移除已上传的简历 */
  const handleRemoveFile = useCallback(() => {
    setResumeFile(null);
    setResumeText("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  /** 开始面试 */
  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      await onStart(resumeText || undefined);
    } catch {
      // onStart 内部已有 toast
    } finally {
      setIsStarting(false);
    }
  }, [onStart, resumeText]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        {/* Logo + 说明 */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Video className="text-primary" size={36} />
          </div>
          <h2 className="font-bold text-2xl">数字人模拟面试</h2>
          <p className="mt-2 max-w-md text-muted-foreground text-sm">
            与数字人面试官进行视频面试。 上传简历可获得更有针对性的面试体验。
          </p>
        </div>

        {/* 简历上传区域 */}
        <div className="w-full max-w-md">
          <input
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />

          {resumeFile ? (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
              <FileText className="shrink-0 text-primary" size={20} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {resumeFile.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {(resumeFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                className="h-7 w-7 shrink-0"
                onClick={handleRemoveFile}
                size="icon"
                variant="ghost"
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <button
              className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-muted-foreground/20 border-dashed px-4 py-6 transition-colors hover:border-primary/50 hover:bg-primary/5"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Upload className="text-muted-foreground" size={24} />
              <span className="font-medium text-muted-foreground text-sm">
                上传简历 PDF（可选）
              </span>
              <span className="text-muted-foreground/60 text-xs">
                上传后面试官会根据简历内容有针对性地提问
              </span>
            </button>
          )}
        </div>

        {/* 岗位 JD 选择 */}
        {onJobTemplateChange && (
          <JobTemplateSelector
            onTemplateChange={onJobTemplateChange}
            selectedTemplate={selectedJobTemplate}
            variant="full"
          />
        )}

        {/* 开始面试按钮 */}
        <Button
          className="h-12 w-full max-w-md rounded-xl text-base"
          disabled={isStarting}
          onClick={handleStart}
          size="lg"
        >
          {isStarting ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={18} />
              启动中...
            </>
          ) : (
            <>
              <Video className="mr-2" size={18} />
              开始视频面试
            </>
          )}
        </Button>

        {/* 启动进度详情 */}
        {isStarting && bootStatus && (
          <p className="max-w-md animate-pulse text-center text-primary text-sm">
            {bootStatus}
          </p>
        )}

        {/* 费用提示 */}
        {!isStarting && (
          <p className="text-center text-muted-foreground/50 text-xs">
            数字人面试按时长计费（约 0.60
            元/分钟），请在面试结束后点击&quot;结束面试&quot;
          </p>
        )}
      </div>
    </div>
  );
}
