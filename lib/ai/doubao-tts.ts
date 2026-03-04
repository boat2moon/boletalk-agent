/**
 * 豆包语音合成 2.0 — WebSocket 双向流式客户端
 *
 * 接口：wss://openspeech.bytedance.com/api/v3/tts/bidirection
 * 协议：自定义二进制帧（4 字节 header + event + payload）
 *
 * 核心流程：
 *   StartConnection(1) → ConnectionStarted(50)
 *   StartSession(100)  → SessionStarted(150)
 *   TaskRequest(200)   → TTSSentenceStart(350) + TTSResponse(352)... + TTSSentenceEnd(351)
 *   FinishSession(102) → SessionFinished(152)
 *   FinishConnection(2)→ ConnectionFinished(52)
 */

// ── 常量 ──────────────────────────────────────────────────────────────

const TTS_WSS_URL = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";

/** 事件码 */
const Event = {
  // 上行
  StartConnection: 1,
  FinishConnection: 2,
  StartSession: 100,
  FinishSession: 102,
  TaskRequest: 200,
  // 下行
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  SessionStarted: 150,
  SessionCanceled: 151,
  SessionFinished: 152,
  SessionFailed: 153,
  TTSSentenceStart: 350,
  TTSSentenceEnd: 351,
  TTSResponse: 352,
} as const;

// ── 二进制协议工具 ──────────────────────────────────────────────────

/**
 * Connection 级帧 (StartConnection / FinishConnection)
 * 格式: header(4) + event(4) + payloadLen(4) + payload
 */
function buildConnectionFrame(event: number, payload?: object): Buffer {
  const payloadBuf = Buffer.from(JSON.stringify(payload ?? {}), "utf-8");
  const buf = Buffer.alloc(4 + 4 + 4 + payloadBuf.length);
  buf[0] = 0x11; // version=1, headerSize=1
  buf[1] = 0x14; // msgType=FullClientReq, flags=hasEvent
  buf[2] = 0x10; // serialization=JSON, compression=none
  buf[3] = 0x00;
  buf.writeUInt32BE(event, 4);
  buf.writeUInt32BE(payloadBuf.length, 8);
  payloadBuf.copy(buf, 12);
  return buf;
}

/**
 * Session 级帧 (StartSession / FinishSession / TaskRequest)
 * 格式: header(4) + event(4) + sessionIdLen(4) + sessionId + payloadLen(4) + payload
 */
function buildSessionFrame(
  event: number,
  sessionId: string,
  payload?: object
): Buffer {
  const sessionIdBuf = Buffer.from(sessionId, "utf-8");
  const payloadBuf = Buffer.from(JSON.stringify(payload ?? {}), "utf-8");
  const buf = Buffer.alloc(
    4 + 4 + 4 + sessionIdBuf.length + 4 + payloadBuf.length
  );

  buf[0] = 0x11;
  buf[1] = 0x14; // FullClientReq, hasEvent
  buf[2] = 0x10; // JSON, no compression
  buf[3] = 0x00;

  let offset = 4;
  buf.writeUInt32BE(event, offset);
  offset += 4;

  buf.writeUInt32BE(sessionIdBuf.length, offset);
  offset += 4;
  sessionIdBuf.copy(buf, offset);
  offset += sessionIdBuf.length;

  buf.writeUInt32BE(payloadBuf.length, offset);
  offset += 4;
  payloadBuf.copy(buf, offset);

  return buf;
}

/** 解析下行帧 */
type ParsedFrame = {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  event: number;
  payload: Buffer;
  /** 仅 error 帧有效 */
  errorCode?: number;
};

function parseServerFrame(data: ArrayBuffer | Buffer): ParsedFrame {
  const buf = Buffer.from(new Uint8Array(data instanceof Buffer ? data : data));
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  // 错误帧特殊处理: msgType=0b1111
  if (messageType === 0x0f) {
    const errorCode = buf.readUInt32BE(4);
    const payloadSize = buf.readUInt32BE(8);
    const payload = buf.subarray(12, 12 + payloadSize);
    return {
      messageType,
      flags,
      serialization,
      compression,
      event: 0,
      errorCode,
      payload,
    };
  }

  // 正常帧: flags=0b0100 表示包含 event
  let offset = 4;
  let event = 0;
  if (flags === 0x04) {
    event = buf.readUInt32BE(offset);
    offset += 4;
  }

  // 服务端 Session 级响应也带 sessionId
  // 事件号 >= 100 时跳过 sessionId
  if (event >= 100 && offset + 4 <= buf.length) {
    const sessionIdLen = buf.readUInt32BE(offset);
    offset += 4 + sessionIdLen;
  }

  // 音频帧或文本帧
  let payload = Buffer.alloc(0);
  if (offset < buf.length) {
    if (messageType === 0x0b) {
      // Audio-only: 剩余全部是音频数据（可能还有 payloadSize 前缀）
      if (offset + 4 <= buf.length) {
        const audioLen = buf.readUInt32BE(offset);
        offset += 4;
        payload = buf.subarray(offset, offset + audioLen);
      } else {
        payload = buf.subarray(offset);
      }
    } else if (messageType === 0x09 && offset + 4 <= buf.length) {
      // Full-server response: payloadSize + payload
      const payloadSize = buf.readUInt32BE(offset);
      offset += 4;
      payload = buf.subarray(offset, offset + payloadSize);
    }
  }

  return { messageType, flags, serialization, compression, event, payload };
}

// ── 高层 API ──────────────────────────────────────────────────────

/**
 * 将 LLM textStream 直接接入豆包双向流式 TTS，返回音频 chunk 的异步迭代器。
 *
 * 返回格式与现有 data-ttsAudio 兼容：{ audioBase64, mimeType }
 */
export async function* streamTTSFromLLM(
  textIterator: AsyncIterable<string>
): AsyncGenerator<{ audioBase64: string; mimeType: string }> {
  const appId = process.env.DOUBAO_VOICE_APP_ID;
  const accessToken = process.env.DOUBAO_VOICE_ACCESS_TOKEN;
  const voiceType =
    process.env.DOUBAO_TTS_VOICE_TYPE || "zh_female_vv_uranus_bigtts";

  if (!appId || !accessToken) {
    throw new Error("Missing DOUBAO_VOICE_APP_ID or DOUBAO_VOICE_ACCESS_TOKEN");
  }

  const connectId = crypto.randomUUID();
  const sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  // ── 建连 ──────────────────────────────────────────────
  const ws = new WebSocket(TTS_WSS_URL, {
    headers: {
      "X-Api-App-Key": appId,
      "X-Api-Access-Key": accessToken,
      "X-Api-Resource-Id": "seed-tts-2.0",
      "X-Api-Connect-Id": connectId,
    },
  } as any);

  // 队列：接收到的音频 chunk
  type QueueItem =
    | { type: "audio"; data: Buffer }
    | { type: "done" }
    | { type: "error"; error: Error };

  const queue: QueueItem[] = [];
  let resolveWaiting: (() => void) | null = null;

  function pushToQueue(item: QueueItem) {
    queue.push(item);
    if (resolveWaiting) {
      resolveWaiting();
      resolveWaiting = null;
    }
  }

  async function waitForItem(): Promise<QueueItem> {
    while (queue.length === 0) {
      await new Promise<void>((resolve) => {
        resolveWaiting = resolve;
      });
    }
    // biome-ignore lint/style/noNonNullAssertion: queue is guaranteed non-empty after wait
    return queue.shift()!;
  }

  // 等待特定事件
  type EventWaiter = {
    events: Set<number>;
    resolve: (event: number) => void;
    reject: (err: Error) => void;
  };
  const eventWaiters: EventWaiter[] = [];

  function waitForEvent(...events: number[]): Promise<number> {
    return new Promise((resolve, reject) => {
      eventWaiters.push({ events: new Set(events), resolve, reject });
    });
  }

  // ── WebSocket 事件处理 ───────────────────────────────
  const openPromise = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) =>
      reject(new Error(`WebSocket error: ${e}`))
    );
  });

  ws.binaryType = "arraybuffer";

  ws.addEventListener("message", (msgEvent: MessageEvent) => {
    const frame = parseServerFrame(msgEvent.data as ArrayBuffer);

    // 错误帧
    if (frame.messageType === 0x0f) {
      const errMsg = frame.payload.toString("utf-8");
      console.error(
        `[doubao-tts] Error frame: code=${frame.errorCode}, msg=${errMsg}`
      );
      pushToQueue({
        type: "error",
        error: new Error(`TTS error ${frame.errorCode}: ${errMsg}`),
      });
      return;
    }

    // 触发事件等待
    const readyWaiters = eventWaiters.filter((w) => w.events.has(frame.event));
    for (const w of readyWaiters) {
      eventWaiters.splice(eventWaiters.indexOf(w), 1);
      w.resolve(frame.event);
    }

    // 音频数据
    if (frame.event === Event.TTSResponse && frame.payload.length > 0) {
      pushToQueue({ type: "audio", data: frame.payload });
    }

    // Session 失败
    if (
      frame.event === Event.SessionFailed ||
      frame.event === Event.ConnectionFailed
    ) {
      let errMsg = "Session/Connection failed";
      try {
        const obj = JSON.parse(frame.payload.toString("utf-8"));
        errMsg = obj.message || obj.status_text || errMsg;
      } catch {
        /* ignore */
      }
      pushToQueue({
        type: "error",
        error: new Error(`[doubao-tts] ${errMsg}`),
      });
    }

    // Session 结束
    if (frame.event === Event.SessionFinished) {
      pushToQueue({ type: "done" });
    }
  });

  ws.addEventListener("close", () => {
    pushToQueue({ type: "done" });
    // Reject any pending event waiters
    for (const w of eventWaiters) {
      w.reject(new Error("WebSocket closed"));
    }
    eventWaiters.length = 0;
  });

  try {
    await openPromise;

    // 1. StartConnection (Connection 级，无 sessionId)
    ws.send(buildConnectionFrame(Event.StartConnection));
    await waitForEvent(Event.ConnectionStarted);

    // 2. StartSession (Session 级，带 sessionId)
    const sessionPayload = {
      event: Event.StartSession,
      namespace: "BidirectionalTTS",
      req_params: {
        speaker: voiceType,
        audio_params: {
          format: "mp3",
          sample_rate: 24_000,
        },
      },
    };
    ws.send(buildSessionFrame(Event.StartSession, sessionId, sessionPayload));
    await waitForEvent(Event.SessionStarted);

    // 3. 异步发送 LLM 文本 deltas (Session 级 TaskRequest)
    const sendTextTask = (async () => {
      for await (const delta of textIterator) {
        if (delta?.trim()) {
          const taskPayload = {
            event: Event.TaskRequest,
            namespace: "BidirectionalTTS",
            req_params: {
              text: delta,
            },
          };
          ws.send(buildSessionFrame(Event.TaskRequest, sessionId, taskPayload));
        }
      }
      // LLM 输出完毕，发 FinishSession
      ws.send(buildSessionFrame(Event.FinishSession, sessionId));
    })();

    // 4. yield 音频 chunk（与文本发送并行）
    // 前端 MSE (MediaSource) 会无缝追加每个 chunk，无需服务端累积
    while (true) {
      const item = await waitForItem();
      if (item.type === "audio") {
        yield {
          audioBase64: item.data.toString("base64"),
          mimeType: "audio/mpeg",
        };
      } else if (item.type === "done") {
        break;
      } else if (item.type === "error") {
        throw item.error;
      }
    }

    // 确保文本发送完毕
    await sendTextTask;

    // 5. FinishConnection (Connection 级)
    ws.send(buildConnectionFrame(Event.FinishConnection));
  } finally {
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  }
}
