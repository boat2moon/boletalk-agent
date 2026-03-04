/**
 * 豆包流式语音识别 2.0 — WebSocket 流式输入模式客户端
 *
 * 接口：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream
 * 协议：自定义二进制帧 (4 字节 header + payload)
 *
 * 流式输入模式工作流：
 *   1. WebSocket 建连（鉴权 header）
 *   2. 发送 full client request（JSON 参数）
 *   3. 分 chunk 发送 audio only request（每包约 200ms 音频）
 *   4. 最后一包带特殊 flag
 *   5. 接收 full server response，取最终 result.text
 *
 * 优势：音频边发边处理，最后一包后 300-400ms 内返回结果
 */

import { gunzipSync, gzipSync } from "node:zlib";

// ── 常量 ──────────────────────────────────────────────────────────────

const ASR_WSS_URL =
  "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";

// ── 二进制协议工具 ──────────────────────────────────────────────────

/**
 * 构造 full client request 帧
 * Byte 0: version(0001) | headerSize(0001) = 0x11
 * Byte 1: msgType(0001=FullClientReq) | flags(0000) = 0x10
 * Byte 2: serialization(0001=JSON) | compression(0001=Gzip) = 0x11
 * Byte 3: reserved = 0x00
 * + payload size (4B) + gzipped JSON payload
 */
function buildFullClientRequest(config: object): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(config), "utf-8");
  const compressed = gzipSync(jsonBuf);

  const buf = Buffer.alloc(4 + 4 + compressed.length);
  buf[0] = 0x11; // version=1, headerSize=1
  buf[1] = 0x10; // msgType=0001(FullClientReq), flags=0000
  buf[2] = 0x11; // serialization=0001(JSON), compression=0001(Gzip)
  buf[3] = 0x00; // reserved

  buf.writeUInt32BE(compressed.length, 4);
  compressed.copy(buf, 8);

  return buf;
}

/**
 * 构造 audio only request 帧
 * Byte 1 flags:
 *   0b0000 = 非最后一包
 *   0b0010 = 最后一包
 */
function buildAudioRequest(audioChunk: Buffer, isLast: boolean): Buffer {
  const compressed = gzipSync(audioChunk);

  const buf = Buffer.alloc(4 + 4 + compressed.length);
  buf[0] = 0x11; // version=1, headerSize=1
  buf[1] = isLast ? 0x22 : 0x20; // msgType=0010(AudioOnly), flags=0010(last) or 0000
  buf[2] = 0x01; // serialization=0000(none), compression=0001(Gzip)
  buf[3] = 0x00; // reserved

  buf.writeUInt32BE(compressed.length, 4);
  compressed.copy(buf, 8);

  return buf;
}

/** 解析 server response 帧 */
type ASRFrame = {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  payload: object | null;
  errorCode?: number;
  errorMessage?: string;
};

function parseServerFrame(data: ArrayBuffer | Buffer): ASRFrame {
  const buf = Buffer.from(new Uint8Array(data instanceof Buffer ? data : data));
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  // 错误帧: msgType=0b1111
  if (messageType === 0x0f) {
    const errorCode = buf.readUInt32BE(4);
    const errorMsgSize = buf.readUInt32BE(8);
    const errorMessage = buf.subarray(12, 12 + errorMsgSize).toString("utf-8");
    return {
      messageType,
      flags,
      serialization,
      compression,
      payload: null,
      errorCode,
      errorMessage,
    };
  }

  // 正常帧: msgType=0b1001 (Full server response)
  // flags=0b0001 表示后 4 字节是 sequence number
  let offset = 4;
  if (flags & 0x01) {
    // 跳过 sequence number
    offset += 4;
  }

  let payload: object | null = null;
  if (offset + 4 <= buf.length) {
    const payloadSize = buf.readUInt32BE(offset);
    offset += 4;
    if (payloadSize > 0 && offset + payloadSize <= buf.length) {
      let payloadBuf: Buffer = Buffer.from(
        buf.subarray(offset, offset + payloadSize)
      );
      // 解压
      if (compression === 0x01) {
        payloadBuf = gunzipSync(payloadBuf);
      }
      try {
        payload = JSON.parse(payloadBuf.toString("utf-8"));
      } catch {
        console.warn("[doubao-stt] Failed to parse JSON payload");
      }
    }
  }

  return { messageType, flags, serialization, compression, payload };
}

// ── 高层 API ──────────────────────────────────────────────────────

/**
 * 使用豆包流式输入模式识别语音。
 *
 * 后端收到完整音频后，通过 WebSocket 分 chunk 送入豆包，
 * 豆包边收边处理，最后一包后快速返回结果。
 *
 * @param audioBuffer 完整音频数据 (WAV/PCM 格式)
 * @param format 音频格式: "wav" | "pcm"
 * @returns 识别文本
 */
export function recognizeSpeechStream(
  audioBuffer: Buffer,
  format: "wav" | "pcm" = "wav"
): Promise<string> {
  const appId = process.env.DOUBAO_VOICE_APP_ID;
  const accessToken = process.env.DOUBAO_VOICE_ACCESS_TOKEN;

  if (!appId || !accessToken) {
    throw new Error("Missing DOUBAO_VOICE_APP_ID or DOUBAO_VOICE_ACCESS_TOKEN");
  }

  const connectId = crypto.randomUUID();

  return new Promise<string>((resolve, reject) => {
    let finalText = "";
    let wsClosedOrDone = false;

    const ws = new WebSocket(ASR_WSS_URL, {
      headers: {
        "X-Api-App-Key": appId,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": "volc.seedasr.sauc.duration",
        "X-Api-Connect-Id": connectId,
      },
    } as any);

    ws.binaryType = "arraybuffer";

    const cleanup = () => {
      if (!wsClosedOrDone) {
        wsClosedOrDone = true;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      }
    };

    ws.addEventListener("error", (e) => {
      cleanup();
      reject(new Error(`[doubao-stt] WebSocket error: ${e}`));
    });

    ws.addEventListener("close", () => {
      if (!wsClosedOrDone) {
        wsClosedOrDone = true;
        // 如果还没 resolve，说明异常关闭
        resolve(finalText);
      }
    });

    ws.addEventListener("message", (msgEvent: MessageEvent) => {
      const frame = parseServerFrame(msgEvent.data as ArrayBuffer);

      // 错误帧
      if (frame.messageType === 0x0f) {
        console.error(
          `[doubao-stt] Error: code=${frame.errorCode}, msg=${frame.errorMessage}`
        );
        cleanup();
        reject(
          new Error(`STT error ${frame.errorCode}: ${frame.errorMessage}`)
        );
        return;
      }

      // Full server response
      if (frame.messageType === 0x09 && frame.payload) {
        const result = (frame.payload as any)?.result;
        if (result?.text) {
          finalText = result.text;
        }
      }

      // 最后一包响应 (flags 包含 0b0010 或 0b0011)
      if (frame.flags & 0x02) {
        cleanup();
        resolve(finalText);
      }
    });

    ws.addEventListener("open", () => {
      // 1. 发送 full client request
      const config = {
        user: { uid: "boletalk" },
        audio: {
          format,
          rate: 16_000,
          bits: 16,
          channel: 1,
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          result_type: "full",
        },
      };
      ws.send(buildFullClientRequest(config));

      // 分 chunk 发送音频
      // 每包约 200ms = 16000 * 2 * 0.2 = 6400 字节 (16kHz 16bit mono)
      const CHUNK_SIZE = 6400;

      // format=wav: 发送完整 WAV（包含头部），豆包会自行解析
      // format=pcm: 发送裸 PCM 数据
      const audioData = audioBuffer;

      let offset = 0;
      const sendNextChunk = () => {
        if (offset >= audioData.length) {
          return;
        }

        const end = Math.min(offset + CHUNK_SIZE, audioData.length);
        const chunk = audioData.subarray(offset, end);
        const isLast = end >= audioData.length;

        ws.send(buildAudioRequest(chunk, isLast));
        offset = end;

        if (!isLast) {
          // 模拟实时发送间隔（但不需要真的等 200ms，快速发即可）
          // 豆包流式输入模式会边收边处理
          setTimeout(sendNextChunk, 10);
        }
      };

      // 等第一个 response 后开始发音频（服务端初始化完成）
      // 实际上流式输入模式在 full client request 之后就可以开始发音频
      // 加一个小延迟确保服务端就绪
      setTimeout(sendNextChunk, 50);
    });

    // 超时保护
    setTimeout(() => {
      if (!wsClosedOrDone) {
        cleanup();
        reject(new Error("[doubao-stt] Recognition timeout (30s)"));
      }
    }, 30_000);
  });
}
