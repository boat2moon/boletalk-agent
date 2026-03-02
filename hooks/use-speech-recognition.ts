"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceHealth } from "@/components/voice-health-context";

/**
 * 将 AudioBuffer 编码为 WAV 格式的 Blob
 */
function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;

  const channelData = audioBuffer.getChannelData(0);
  const dataLength = channelData.length * (bitsPerSample / 8);
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
  for (const sample of channelData) {
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

/**
 * 尝试将 webm 转为 wav
 */
async function tryConvertToWAV(webmBlob: Blob): Promise<Blob | null> {
  try {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16_000 });
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return encodeWAV(audioBuffer);
    } finally {
      await audioContext.close();
    }
  } catch {
    console.warn("WAV conversion failed, will send original format");
    return null;
  }
}

/**
 * 语音识别 (STT) Hook
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const { reportSuccess, reportFailure } = useVoiceHealth();

  // 开始录音
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16_000,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsListening(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsListening(false);
    }
  }, []);

  // 停止录音并识别
  const stopListening = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        setIsListening(false);
        resolve("");
        return;
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsProcessing(true);

        // 释放麦克风
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
        }

        const recordedBlob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current,
        });
        chunksRef.current = [];

        // 过滤太短的录音
        if (recordedBlob.size < 5000) {
          setIsProcessing(false);
          resolve("");
          return;
        }

        try {
          const wavBlob = await tryConvertToWAV(recordedBlob);
          const audioBlob = wavBlob || recordedBlob;
          const fileName = wavBlob ? "recording.wav" : "recording.webm";

          const formData = new FormData();
          formData.append("audio", audioBlob, fileName);

          const response = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });

          // 读取健康追踪响应头
          const provider = response.headers.get("X-Voice-Provider") || "";
          const degradedStr = response.headers.get("X-Voice-Degraded") || "";
          const degradedList = degradedStr ? degradedStr.split(",") : [];

          if (!response.ok) {
            // 全部失败
            if (degradedList.length > 0) {
              for (const d of degradedList) {
                reportFailure(d === "zhipu" ? "zhipu-stt" : d);
              }
            }
            throw new Error(`STT failed: ${response.status}`);
          }

          // 成功：上报
          if (provider && provider !== "none") {
            const mappedProvider =
              provider === "zhipu" ? "zhipu-stt" : provider;
            const mappedDegraded = degradedList.map((d) =>
              d === "zhipu" ? "zhipu-stt" : d
            );
            reportSuccess(mappedProvider, mappedDegraded);
          }

          const result = await response.json();
          setIsProcessing(false);
          resolve(result.text || "");
        } catch (error) {
          console.error("STT error:", error);
          setIsProcessing(false);
          resolve("");
        }
      };

      mediaRecorder.stop();
    });
  }, [reportSuccess, reportFailure]);

  // 取消录音
  const cancelListening = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    chunksRef.current = [];
    setIsListening(false);
    setIsProcessing(false);
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  return {
    startListening,
    stopListening,
    cancelListening,
    isListening,
    isProcessing,
  };
}
