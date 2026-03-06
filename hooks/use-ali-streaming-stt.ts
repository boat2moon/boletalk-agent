"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 阿里云实时语音识别 Hook — 浏览器直连（按需连接架构）
 *
 * 关键设计：阿里云 NLS 不支持空闲预连接（10 秒无数据会被断开），
 * 所以在 startRecording() 时才建立 WebSocket，录完即断。
 *
 * 接口设计保持与旧 hook 兼容：
 * - connectionStatus: "ready" 表示 Token 已缓存可用
 * - startRecording(): 建连 → StartTranscription → 采集音频
 * - stopRecording(): 停止采集 → StopTranscription → 等结果 → 断连
 */

/** AudioWorklet 内联代码 — 支持降采样到 16kHz */
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 0;
    this._targetSamples = 3200; // 200ms @ 16kHz = 3200 samples
    this._resampleRatio = sampleRate / 16000;
    this._resampleAccum = 0;
    this.port.postMessage({ type: 'info', sampleRate: sampleRate, ratio: this._resampleRatio });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];

    // 降采样到 16kHz
    const downsampled = [];
    for (let i = 0; i < channelData.length; i++) {
      this._resampleAccum += 1;
      if (this._resampleAccum >= this._resampleRatio) {
        this._resampleAccum -= this._resampleRatio;
        downsampled.push(channelData[i]);
      }
    }

    for (const sample of downsampled) {
      this._buffer.push(sample);
      this._bufferSize++;
    }

    while (this._bufferSize >= this._targetSamples) {
      const chunk = this._buffer.splice(0, this._targetSamples);
      this._bufferSize -= this._targetSamples;
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage({ type: 'audio', buffer: pcm.buffer }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

type ConnectionStatus = "disconnected" | "connecting" | "ready" | "failed";

type AliStreamingSTTState = {
  connectionStatus: ConnectionStatus;
  isRecording: boolean;
  text: string;
  isFinal: boolean;
};

function generateUUID(): string {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx"
    .replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
    .slice(0, 32);
}

export function useAliStreamingSTT() {
  const [state, setState] = useState<AliStreamingSTTState>({
    connectionStatus: "disconnected",
    isRecording: false,
    text: "",
    isFinal: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const taskIdRef = useRef("");
  const tokenRef = useRef<{ token: string; appkey: string } | null>(null);

  // 累积所有已确认句子的最终文本
  const confirmedTextRef = useRef("");
  const interimTextRef = useRef("");
  const completedResolverRef = useRef<((text: string) => void) | null>(null);

  /** 获取/缓存 Token 和 Appkey */
  const fetchToken = useCallback(async () => {
    // 已缓存就直接用（Token 有效期很长，在 server 端有 5 分钟缓存判断）
    if (tokenRef.current) {
      return tokenRef.current;
    }

    const res = await fetch("/api/ali-asr/token", { method: "POST" });
    if (!res.ok) {
      throw new Error("Failed to fetch NLS token");
    }
    const data = (await res.json()) as { token: string; appkey: string };
    tokenRef.current = data;
    return data;
  }, []);

  /** "预热"：获取 Token 让 connectionStatus 变为 ready */
  const connect = useCallback(async () => {
    if (state.connectionStatus === "ready") {
      return;
    }

    setState((s) => ({ ...s, connectionStatus: "connecting" }));
    try {
      await fetchToken();
      setState((s) => ({ ...s, connectionStatus: "ready" }));
      console.log("[ali-asr] Token fetched, ready to record");
    } catch (e) {
      console.error("[ali-asr] Failed to fetch token:", e);
      setState((s) => ({ ...s, connectionStatus: "failed" }));
    }
  }, [fetchToken, state.connectionStatus]);

  /** 清理音频资源 */
  const cleanupAudio = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // silently ignore close errors
      });
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  /** 关闭 WebSocket */
  const closeWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  /** 发送 JSON 控制指令 */
  const sendCommand = useCallback(
    (
      ws: WebSocket,
      appkey: string,
      name: string,
      payload?: Record<string, unknown>
    ) => {
      const msg: Record<string, unknown> = {
        header: {
          message_id: generateUUID(),
          task_id: taskIdRef.current,
          namespace: "SpeechTranscriber",
          name,
          appkey,
        },
      };
      if (payload) {
        msg.payload = payload;
      }
      ws.send(JSON.stringify(msg));
    },
    []
  );

  /** 开始录音（采集音频 → 建连 → 开始识别，音频预缓冲防吞字） */
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (isRecordingRef.current) {
      return false;
    }

    try {
      // 确保有 Token
      const { token, appkey } = await fetchToken();

      // 重置状态
      confirmedTextRef.current = "";
      interimTextRef.current = "";
      taskIdRef.current = generateUUID();

      setState((s) => ({
        ...s,
        isRecording: true,
        text: "",
        isFinal: false,
      }));

      // ── 1. 先启动音频采集（立即开始录音，不等 WebSocket） ──
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16_000 });
      audioContextRef.current = audioContext;

      const blob = new Blob([WORKLET_CODE], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNodeRef.current = workletNode;

      // 音频预缓冲：在 ASR 就绪之前，所有 PCM chunk 存入 preBuffer
      const preBuffer: ArrayBuffer[] = [];
      let asrReady = false;

      workletNode.port.onmessage = (e) => {
        if (e.data.type === "info") {
          console.log(
            `[ali-asr] AudioWorklet: sampleRate=${e.data.sampleRate}, ratio=${e.data.ratio}`
          );
          return;
        }
        if (e.data.type === "audio" && isRecordingRef.current) {
          if (asrReady && wsRef.current?.readyState === WebSocket.OPEN) {
            // ASR 已就绪，直接发送
            wsRef.current.send(e.data.buffer as ArrayBuffer);
          } else {
            // ASR 未就绪，缓冲
            preBuffer.push(e.data.buffer as ArrayBuffer);
          }
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      isRecordingRef.current = true;
      console.log("[ali-asr] Audio capture started (pre-buffering)");

      // ── 2. 建立 WebSocket + 等待 TranscriptionStarted ──
      const wsUrl = `wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      return new Promise<boolean>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.error("[ali-asr] Connection timeout");
            cleanupAudio();
            closeWs();
            setState((s) => ({ ...s, isRecording: false }));
            resolve(false);
          }
        }, 8000);

        ws.onopen = () => {
          console.log(
            "[ali-asr] WebSocket connected, sending StartTranscription"
          );
          sendCommand(ws, appkey, "StartTranscription", {
            format: "pcm",
            sample_rate: 16_000,
            enable_intermediate_result: true,
            enable_punctuation_prediction: true,
            enable_inverse_text_normalization: true,
          });
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            const name = msg.header?.name;
            const status = msg.header?.status;

            console.log(`[ali-asr] Event: ${name}, status: ${status}`);

            if (status && status !== 20_000_000) {
              console.error(
                `[ali-asr] Error: ${msg.header?.status_text || msg.header?.status_message}`
              );
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                cleanupAudio();
                closeWs();
                setState((s) => ({ ...s, isRecording: false }));
                resolve(false);
              }
              return;
            }

            switch (name) {
              case "TranscriptionStarted": {
                // ── ASR 就绪：先 flush 预缓冲的音频，再切换到实时发送 ──
                console.log(
                  `[ali-asr] Transcription started, flushing ${preBuffer.length} buffered chunks`
                );
                for (const chunk of preBuffer) {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(chunk);
                  }
                }
                preBuffer.length = 0; // 清空缓冲
                asrReady = true; // 后续音频直接发送

                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(true);
                }
                break;
              }

              case "SentenceBegin":
                break;

              case "TranscriptionResultChanged": {
                const interimResult = msg.payload?.result || "";
                interimTextRef.current = interimResult;
                setState((s) => ({
                  ...s,
                  text: confirmedTextRef.current + interimResult,
                  isFinal: false,
                }));
                break;
              }

              case "SentenceEnd": {
                const sentenceText = msg.payload?.result || "";
                confirmedTextRef.current += sentenceText;
                interimTextRef.current = "";
                setState((s) => ({
                  ...s,
                  text: confirmedTextRef.current,
                  isFinal: false,
                }));
                break;
              }

              case "TranscriptionCompleted": {
                const finalText = confirmedTextRef.current;
                console.log(`[ali-asr] Completed, text: ${finalText}`);
                isRecordingRef.current = false;
                setState((s) => ({
                  ...s,
                  text: finalText,
                  isFinal: true,
                  isRecording: false,
                }));
                completedResolverRef.current?.(finalText);
                completedResolverRef.current = null;
                closeWs();
                break;
              }

              case "TaskFailed": {
                console.error(
                  `[ali-asr] Task failed: ${msg.header?.status_text || msg.header?.status_message}`
                );
                isRecordingRef.current = false;
                setState((s) => ({ ...s, isRecording: false }));
                completedResolverRef.current?.("");
                completedResolverRef.current = null;
                closeWs();
                break;
              }

              default:
                break;
            }
          } catch (e) {
            console.error("[ali-asr] Failed to parse message:", e);
          }
        };

        ws.onerror = () => {
          console.error("[ali-asr] WebSocket error");
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            cleanupAudio();
            setState((s) => ({ ...s, isRecording: false }));
            resolve(false);
          }
        };

        ws.onclose = () => {
          console.log("[ali-asr] WebSocket closed");
          isRecordingRef.current = false;
          wsRef.current = null;
        };
      });
    } catch (e) {
      console.error("[ali-asr] startRecording failed:", e);
      cleanupAudio();
      closeWs();
      setState((s) => ({ ...s, isRecording: false }));
      return false;
    }
  }, [fetchToken, sendCommand, cleanupAudio, closeWs]);

  /** 停止录音 */
  const stopRecording = useCallback((): Promise<string> => {
    isRecordingRef.current = false;
    cleanupAudio();

    // 发送 StopTranscription
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendCommand(
        wsRef.current,
        tokenRef.current?.appkey || "",
        "StopTranscription"
      );
    }

    // 等待 TranscriptionCompleted（最多 5 秒）
    return new Promise<string>((resolve) => {
      completedResolverRef.current = resolve;
      setTimeout(() => {
        if (completedResolverRef.current) {
          const text = confirmedTextRef.current;
          completedResolverRef.current = null;
          closeWs();
          resolve(text);
        }
      }, 5000);
    });
  }, [sendCommand, cleanupAudio, closeWs]);

  /** 断开（清理一切） */
  const disconnect = useCallback(() => {
    isRecordingRef.current = false;
    cleanupAudio();
    closeWs();
    tokenRef.current = null;
    setState({
      connectionStatus: "disconnected",
      isRecording: false,
      text: "",
      isFinal: false,
    });
  }, [cleanupAudio, closeWs]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      isRecordingRef.current = false;
      cleanupAudio();
      closeWs();
    };
  }, [cleanupAudio, closeWs]);

  return {
    ...state,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  };
}
