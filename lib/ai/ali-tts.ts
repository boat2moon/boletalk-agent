/**
 * 阿里云 CosyVoice 流式文本语音合成 — WebSocket 客户端（服务端运行）
 *
 * 协议：wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1?token=xxx
 * namespace: FlowingSpeechSynthesizer
 *
 * 核心流程：
 *   1. 建立 WebSocket → 发送 StartSynthesis（含 voice / format / sample_rate）
 *   2. 等待 SynthesisStarted 事件
 *   3. 逐 chunk 发送 RunSynthesis（LLM 流式文本，不需要自行切句）
 *   4. 文本流结束后发送 StopSynthesis
 *   5. 收集 Binary Frame（MP3 音频），转 base64 yield
 *   6. 收到 SynthesisCompleted 后关闭连接
 *
 * 返回格式与 doubao-tts.ts 的 streamTTSFromLLM 完全兼容：
 *   yield { audioBase64: string, mimeType: string }
 */

import RPCClient from "@alicloud/pop-core";

// ── Token 缓存（与 ali-asr token route 逻辑一致）──────────────
let cachedToken: { token: string; expireTime: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expireTime > Date.now() / 1000 + 300) {
    return cachedToken.token;
  }

  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "Missing ALIBABA_CLOUD_ACCESS_KEY_ID or ALIBABA_CLOUD_ACCESS_KEY_SECRET"
    );
  }

  const client = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: "https://nls-meta.cn-shanghai.aliyuncs.com",
    apiVersion: "2019-02-28",
  });

  const result = await client.request<{
    Token: { Id: string; ExpireTime: number };
  }>("CreateToken", {}, { method: "POST" });

  cachedToken = {
    token: result.Token.Id,
    expireTime: result.Token.ExpireTime,
  };

  return cachedToken.token;
}

// ── 工具函数 ──────────────────────────────────────────────────
function generateUUID(): string {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx"
    .replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
    .slice(0, 32);
}

// ── 配置 ──────────────────────────────────────────────────────
const NLS_GATEWAY = "wss://nls-gateway-cn-beijing.aliyuncs.com/ws/v1";
const DEFAULT_VOICE = "zhixiaoxia"; // 知小夏, 普通话女声, 对话数字人场景
const AUDIO_FORMAT = "mp3";
const SAMPLE_RATE = 24_000;

// 音频 chunk 最小大小（字节），避免太小的 chunk 影响播放
const MIN_AUDIO_CHUNK_SIZE = 4096;

/**
 * 将 LLM textStream 直接接入 CosyVoice 流式 TTS，返回音频 chunk 的异步迭代器。
 *
 * 返回格式与 doubao-tts.ts 兼容：{ audioBase64, mimeType }
 */
export async function* streamTTSFromLLM(
  textIterator: AsyncIterable<string>
): AsyncGenerator<{ audioBase64: string; mimeType: string }> {
  const appkey = process.env.ALI_NLS_APPKEY;
  if (!appkey) {
    throw new Error("Missing ALI_NLS_APPKEY");
  }

  const token = await getToken();
  const taskId = generateUUID();

  // ── 队列：接收音频 chunk ──────────────────────────────────
  type QueueItem =
    | { type: "audio"; data: Uint8Array }
    | { type: "done" }
    | { type: "error"; error: Error };

  const queue: QueueItem[] = [];
  let resolver: ((item: QueueItem) => void) | null = null;

  function pushToQueue(item: QueueItem) {
    if (resolver) {
      const r = resolver;
      resolver = null;
      r(item);
    } else {
      queue.push(item);
    }
  }

  function waitForItem(): Promise<QueueItem> {
    if (queue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: queue is guaranteed non-empty
      return Promise.resolve(queue.shift()!);
    }
    return new Promise<QueueItem>((resolve) => {
      resolver = resolve;
    });
  }

  // ── 音频缓冲区（合并小的 Binary Frame 为更大的 chunk）──────
  let audioBuffer: Uint8Array[] = [];
  let audioBufferSize = 0;

  function flushAudioBuffer() {
    if (audioBufferSize > 0) {
      // 合并所有片段
      const merged = new Uint8Array(audioBufferSize);
      let offset = 0;
      for (const chunk of audioBuffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      pushToQueue({ type: "audio", data: merged });
      audioBuffer = [];
      audioBufferSize = 0;
    }
  }

  // ── 发送 JSON 指令 ──────────────────────────────────────────
  function sendTtsCommand(
    wsConn: WebSocket,
    name: string,
    payload?: Record<string, unknown>
  ) {
    const msg: Record<string, unknown> = {
      header: {
        message_id: generateUUID(),
        task_id: taskId,
        namespace: "FlowingSpeechSynthesizer",
        name,
        appkey,
      },
    };
    if (payload) {
      msg.payload = payload;
    }
    wsConn.send(JSON.stringify(msg));
  }

  // ── 辅助：Uint8Array → base64 ──────────────────────────────
  function uint8ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  // ── 建立 WebSocket 连接（使用原生 WebSocket API）────────────
  const wsUrl = `${NLS_GATEWAY}?token=${token}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  let synthesisStarted = false;
  let startedResolve: (() => void) | null = null;
  const startedPromise = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });

  ws.addEventListener("open", () => {
    console.log("[ali-tts] WebSocket connected, sending StartSynthesis");
    sendTtsCommand(ws, "StartSynthesis", {
      voice: DEFAULT_VOICE,
      format: AUDIO_FORMAT,
      sample_rate: SAMPLE_RATE,
      volume: 50,
      speech_rate: 0,
      pitch_rate: 0,
    });
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    const { data } = event;

    // 二进制帧 = 音频数据
    if (data instanceof ArrayBuffer) {
      const chunk = new Uint8Array(data);
      audioBuffer.push(chunk);
      audioBufferSize += chunk.length;

      if (audioBufferSize >= MIN_AUDIO_CHUNK_SIZE) {
        flushAudioBuffer();
      }
      return;
    }

    // 文本帧 = JSON 事件
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        const name = msg.header?.name;
        const status = msg.header?.status;

        console.log(`[ali-tts] Event: ${name}, status: ${status}`);

        if (status && status !== 20_000_000) {
          const errorMsg =
            msg.header?.status_text ||
            msg.header?.status_message ||
            "Unknown error";
          console.error(`[ali-tts] Error: ${errorMsg}`);
          pushToQueue({
            type: "error",
            error: new Error(`CosyVoice error: ${errorMsg}`),
          });
          return;
        }

        switch (name) {
          case "SynthesisStarted":
            synthesisStarted = true;
            startedResolve?.();
            break;

          case "SynthesisCompleted":
            console.log("[ali-tts] Synthesis completed");
            flushAudioBuffer();
            pushToQueue({ type: "done" });
            break;

          case "TaskFailed":
            pushToQueue({
              type: "error",
              error: new Error(
                `CosyVoice task failed: ${msg.header?.status_text}`
              ),
            });
            break;

          default:
            break;
        }
      } catch (e) {
        console.error("[ali-tts] Failed to parse message:", e);
      }
    }
  });

  ws.addEventListener("error", () => {
    console.error("[ali-tts] WebSocket error");
    pushToQueue({
      type: "error",
      error: new Error("CosyVoice WebSocket error"),
    });
  });

  ws.addEventListener("close", () => {
    console.log("[ali-tts] WebSocket closed");
    if (!synthesisStarted) {
      startedResolve?.();
    }
  });

  // ── 等待 SynthesisStarted ──────────────────────────────────
  await startedPromise;
  if (!synthesisStarted) {
    ws.close();
    throw new Error("[ali-tts] Connection closed before SynthesisStarted");
  }

  // ── 异步喂入 LLM 文本流 ──────────────────────────────────
  const feedText = async () => {
    try {
      let textAccum = "";
      for await (const delta of textIterator) {
        textAccum += delta;

        // 攒够一定长度再发（减少 WebSocket 消息数量）
        if (textAccum.length >= 20) {
          sendTtsCommand(ws, "RunSynthesis", { text: textAccum });
          textAccum = "";
        }
      }

      // 发送剩余文本
      if (textAccum) {
        sendTtsCommand(ws, "RunSynthesis", { text: textAccum });
      }

      // 文本流结束，发送 StopSynthesis
      console.log("[ali-tts] Text stream ended, sending StopSynthesis");
      sendTtsCommand(ws, "StopSynthesis");
    } catch (err) {
      console.error("[ali-tts] Error feeding text:", err);
      pushToQueue({ type: "error", error: err as Error });
    }
  };

  // 在后台喂文本（不阻塞音频输出）
  feedText();

  // ── yield 音频 chunk ──────────────────────────────────────
  try {
    while (true) {
      const item = await waitForItem();
      if (item.type === "audio") {
        yield {
          audioBase64: uint8ToBase64(item.data),
          mimeType: "audio/mpeg",
        };
      } else if (item.type === "done") {
        break;
      } else if (item.type === "error") {
        throw item.error;
      }
    }
  } finally {
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  }
}
