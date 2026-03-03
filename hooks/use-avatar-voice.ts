"use client";

/**
 * Avatar 实时语音交互 Hook
 *
 * 核心流程：
 * 1. 麦克风常开 + Silero VAD 自动检测说话
 * 2. 检测到用户停顿 → 音频自动转 WAV → /api/stt 识别
 * 3. 识别文字 → /api/avatar/send → 数字人播报
 * 4. 半双工：数字人说话时丢弃检测到的语音（回音消除）
 */

import { useMicVAD } from "@ricky0123/vad-react";
import * as ort from "onnxruntime-web/wasm";
import { useCallback, useEffect, useRef, useState } from "react";

// 在 VAD 初始化之前配置 ONNX Runtime WASM 路径
// Next.js Turbopack 会重写动态 import 路径，导致 WASM 加载失败
// 必须在模块顶层设置，确保 ONNX Runtime 从 public/vad/ 加载
if (typeof window !== "undefined") {
  ort.env.wasm.wasmPaths = "/vad/";
}

// ── 类型 ──────────────────────────────────────────────

export type VoiceStatus =
  | "idle" // 初始化中
  | "listening" // 🎙️ 正在听
  | "speaking" // 🗣️ 用户说话中（VAD 检测到声音）
  | "processing" // 🤔 识别中…
  | "replying" // 💬 数字人回复中
  | "error"; // ❌ 出错

type AvatarVoiceOptions = {
  /** 数字人会话 ID */
  sessionId: string;
  /** 对话上下文（Agent 使用） */
  messages: Array<{ role: string; content: string }>;
  /** 简历上下文（可选，注入 system prompt） */
  resumeContext?: string;
  /** 数字人是否正在播报（半双工控制） */
  isAvatarSpeaking: boolean;
  /** 收到识别文字时的回调 */
  onTranscript: (text: string) => void;
  /** 收到 Agent 回复时的回调 */
  onAgentReply: (text: string) => void;
};

// ── WAV 编码（复用 use-speech-recognition 的逻辑） ────

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataLength = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (pos: number, str: string) => {
    for (const [i, char] of [...str].entries()) {
      view.setUint8(pos + i, char.charCodeAt(0));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x80_00 : clamped * 0x7f_ff,
      true
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ── Hook ──────────────────────────────────────────────

export function useAvatarVoice({
  sessionId,
  messages,
  resumeContext,
  isAvatarSpeaking,
  onTranscript,
  onAgentReply,
}: AvatarVoiceOptions) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const isAvatarSpeakingRef = useRef(isAvatarSpeaking);
  const processingRef = useRef(false);

  // 保持 ref 同步
  useEffect(() => {
    isAvatarSpeakingRef.current = isAvatarSpeaking;
    if (isAvatarSpeaking) {
      setVoiceStatus("replying");
    }
  }, [isAvatarSpeaking]);

  /**
   * 处理 VAD 检测到的语音片段
   * 1. WAV 编码 → /api/stt → 文字
   * 2. 文字 → /api/avatar/send → 数字人播报
   */
  const handleSpeechEnd = useCallback(
    async (audio: Float32Array) => {
      // 防止并发处理
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;

      // 如果数字人正在说话，标记为打断模式
      const shouldInterrupt = isAvatarSpeakingRef.current;

      try {
        // 过滤太短的音频（小于 0.3 秒大概率是噪音）
        if (audio.length < 16_000 * 0.3) {
          return;
        }

        setVoiceStatus("processing");

        // 1. WAV 编码
        const wavBlob = encodeWAV(audio, 16_000);

        // 2. 发送到 STT
        const formData = new FormData();
        formData.append("audio", wavBlob, "recording.wav");

        const sttRes = await fetch("/api/stt", {
          method: "POST",
          body: formData,
        });

        if (!sttRes.ok) {
          console.error("[AvatarVoice] STT 失败:", sttRes.status);
          setVoiceStatus("listening");
          return;
        }

        const sttResult = await sttRes.json();
        const text = sttResult.text?.trim();

        if (!text) {
          setVoiceStatus("listening");
          return;
        }

        console.log(
          "[AvatarVoice] 识别结果:",
          text,
          shouldInterrupt ? "(打断模式)" : ""
        );
        onTranscript(text);

        // 3. 发送到 Agent + 数字人播报
        setVoiceStatus("replying");

        const sendRes = await fetch("/api/avatar/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            userText: text,
            messages,
            resumeContext,
            interrupt: shouldInterrupt,
          }),
        });

        if (!sendRes.ok) {
          console.error("[AvatarVoice] Agent 发送失败:", sendRes.status);
          setVoiceStatus("listening");
          return;
        }

        const sendResult = await sendRes.json();
        if (sendResult.replyText) {
          onAgentReply(sendResult.replyText);
        }

        // 播报结束后会通过 isAvatarSpeaking 回到 listening
        // 这里暂时用超时估算
        // 大约每个字 200ms 的播报时间
        const estimatedDuration = Math.max(
          3000,
          (sendResult.replyText?.length || 0) * 200
        );
        setTimeout(() => {
          if (!isAvatarSpeakingRef.current) {
            setVoiceStatus("listening");
          }
        }, estimatedDuration);
      } catch (err) {
        console.error("[AvatarVoice] 处理语音失败:", err);
        setVoiceStatus("listening");
      } finally {
        processingRef.current = false;
      }
    },
    [sessionId, messages, resumeContext, onTranscript, onAgentReply]
  );

  // 使用 @ricky0123/vad-react 的 useMicVAD
  const vad = useMicVAD({
    // 使用 legacy 模型（较小，兼容性好）
    model: "legacy",
    // 模型和 worklet 文件路径（从 public/vad/ 加载）
    baseAssetPath: "/vad/",
    // ONNX Runtime WASM 文件路径（避免 Next.js 动态 import 失败）
    onnxWASMBasePath: "/vad/",
    // 语音检测参数
    positiveSpeechThreshold: 0.8, // 较高阈值：减少误触
    negativeSpeechThreshold: 0.3,
    minSpeechMs: 300, // 至少 300ms 才算说话
    redemptionMs: 600, // 停顿 600ms 后判定结束
    // 回调
    onSpeechStart: () => {
      if (!isAvatarSpeakingRef.current) {
        setVoiceStatus("speaking");
      }
    },
    onSpeechEnd: (audio: Float32Array) => {
      handleSpeechEnd(audio);
    },
    startOnLoad: true,
  });

  // VAD 加载完成后更新状态
  useEffect(() => {
    if (vad.loading) {
      setVoiceStatus("idle");
    } else if (vad.errored) {
      setVoiceStatus("error");
      console.error("[AvatarVoice] VAD 初始化失败:", vad.errored);
    } else if (voiceStatus === "idle") {
      setVoiceStatus("listening");
    }
  }, [vad.loading, vad.errored, voiceStatus]);

  return {
    voiceStatus,
    isVADReady: !vad.loading && !vad.errored,
  };
}
