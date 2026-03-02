"use client";

/**
 * 阶段1：面试准备页面
 *
 * 功能：
 * - 上传简历 PDF（可选）
 * - 选择 Realtime 模型
 * - 展示简历分析结果（如有）
 * - 点击"开始面试"进入通话阶段
 */

import { FileText, Loader2, Mic, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { realtimeModels } from "@/lib/ai/realtime-models";

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

export function PreparationView({
  selectedModel,
  onModelChange,
  onStart,
}: {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onStart: (resumeText?: string) => Promise<void>;
}) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [isAnalyzing, _setIsAnalyzing] = useState(false);
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

      // 解析 PDF 为文本（复用现有的 base64 上传逻辑，让服务端解析）
      try {
        const base64 = await readFileAsBase64(file);
        // 存储 base64，后续传给服务端解析
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

  const _currentModel = realtimeModels.find((m) => m.id === selectedModel);

  return (
    <div className="flex h-full flex-col">
      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        {/* Logo + 说明 */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Mic className="text-primary" size={36} />
          </div>
          <h2 className="font-bold text-2xl">电话模拟面试</h2>
          <p className="mt-2 max-w-md text-muted-foreground text-sm">
            与 AI 面试官进行实时语音对话，体验真实面试场景。
            上传简历可获得更有针对性的面试体验。
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

        {/* 模型选择 */}
        <div className="w-full max-w-md">
          <span className="mb-2 block font-medium text-sm">选择语音模型</span>
          <div className="flex flex-col gap-2">
            {realtimeModels.map((model) => (
              <button
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  model.id === selectedModel
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : model.disabled
                      ? "cursor-not-allowed border-muted bg-muted/20 opacity-50"
                      : "cursor-pointer border-border hover:border-primary/50"
                }`}
                disabled={model.disabled}
                key={model.id}
                onClick={() => {
                  if (!model.disabled) {
                    onModelChange(model.id);
                  }
                }}
                type="button"
              >
                <div className="flex-1">
                  <p className="font-medium text-sm">{model.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {model.description}
                  </p>
                </div>
                {model.id === selectedModel && (
                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 开始面试按钮 */}
        <Button
          className="h-12 w-full max-w-md rounded-xl text-base"
          disabled={isStarting || isAnalyzing}
          onClick={handleStart}
          size="lg"
        >
          {isStarting ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={18} />
              {resumeFile ? "分析简历中..." : "准备面试中..."}
            </>
          ) : (
            <>
              <Mic className="mr-2" size={18} />
              开始模拟面试
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
