/**
 * TTS API 路由
 * 统一级联：豆包 → 阿里云 CosyVoice → MiniMax Speech-02 → 智谱 GLM-TTS
 * 响应头包含 X-Voice-Provider 和 X-Voice-Degraded 供前端健康追踪
 */

import { streamTTSFromLLM as streamTTSFromAli } from "@/lib/ai/ali-tts";
import { streamTTSFromLLM as streamTTSFromDoubao } from "@/lib/ai/doubao-tts";

export const maxDuration = 60;

/**
 * 将完整文本包装为单元素异步可迭代对象，供 streamTTSFromLLM 消费
 */
// biome-ignore lint/suspicious/useAwait: async function* is needed to produce AsyncIterable
async function* textToAsyncIterable(text: string): AsyncIterable<string> {
  yield text;
}

/**
 * 将流式 TTS 的音频 chunk 包装为 ReadableStream 返回给前端
 */
function streamingResponse(
  generator: AsyncGenerator<{ audioBase64: string; mimeType: string }>,
  provider: string,
  degraded: string[]
): Response {
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await generator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(Buffer.from(value.audioBase64, "base64"));
      } catch {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "X-Voice-Provider": provider,
      "X-Voice-Streaming": "true",
      ...(degraded.length > 0
        ? { "X-Voice-Degraded": degraded.join(",") }
        : {}),
    },
  });
}

/**
 * 豆包双向流式 TTS — 返回流式响应
 */
function tryDoubaoStreaming(text: string, degraded: string[]): Response | null {
  try {
    const generator = streamTTSFromDoubao(textToAsyncIterable(text));
    return streamingResponse(generator, "doubao-tts", degraded);
  } catch (error) {
    console.warn("[api/tts] Doubao TTS init failed:", error);
    return null;
  }
}

/**
 * 阿里云 CosyVoice 流式 TTS — 返回流式响应
 */
function tryAliStreaming(text: string, degraded: string[]): Response | null {
  try {
    const generator = streamTTSFromAli(textToAsyncIterable(text));
    return streamingResponse(generator, "ali-tts", degraded);
  } catch (error) {
    console.warn("[api/tts] Ali CosyVoice TTS init failed:", error);
    return null;
  }
}

/**
 * 给 PCM 数据添加 WAV 文件头（智谱 GLM-TTS 降级用）
 */
function pcmToWav(
  pcmData: ArrayBuffer,
  sampleRate = 24_000,
  numChannels = 1,
  bitsPerSample = 16
): ArrayBuffer {
  const dataLength = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  new Uint8Array(buffer).set(new Uint8Array(pcmData), 44);
  return buffer;
}

/**
 * MiniMax TTS (Speech-02)
 */
async function tryMiniMax(text: string): Promise<Response | null> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      "https://api.minimaxi.com/v1/t2a_v2?GroupId=2028066404082651879",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "speech-02-turbo",
          text: text.slice(0, 5000),
          stream: false,
          voice_setting: {
            voice_id: "male-qn-qingse",
            speed: 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32_000,
            bitrate: 128_000,
            format: "mp3",
            channel: 1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("MiniMax TTS failed:", response.status, errorText);
      return null;
    }

    const result = await response.json();

    if (result?.base_resp?.status_code !== 0) {
      console.warn("MiniMax TTS error:", result?.base_resp?.status_msg);
      return null;
    }

    const audioHex = result?.data?.audio;
    if (!audioHex) {
      console.warn("MiniMax TTS: no audio data");
      return null;
    }

    const audioBuffer = Buffer.from(audioHex, "hex");
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.warn("MiniMax TTS error:", error);
    return null;
  }
}

/**
 * 智谱 GLM-TTS 降级方案
 */
async function fallbackZhipu(text: string): Promise<Response | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-tts",
          input: text.slice(0, 1024),
          voice: "tongtong",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GLM-TTS API error:", response.status, errorText);
      return null;
    }

    const pcmBuffer = await response.arrayBuffer();
    const wavBuffer = pcmToWav(pcmBuffer);

    return new Response(wavBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("GLM-TTS error:", error);
    return null;
  }
}

export async function POST(request: Request) {
  const { text } = await request.json();

  if (!text || typeof text !== "string") {
    return new Response("Missing text parameter", { status: 400 });
  }

  const degraded: string[] = [];

  // 1. 优先豆包（流式）
  const doubaoResult = tryDoubaoStreaming(text, degraded);
  if (doubaoResult) {
    return doubaoResult;
  }
  degraded.push("doubao-tts");

  // 2. 阿里云 CosyVoice（流式）
  const aliResult = tryAliStreaming(text, degraded);
  if (aliResult) {
    return aliResult;
  }
  degraded.push("ali-tts");

  // 3. MiniMax（非流式）
  const minimaxResult = await tryMiniMax(text);
  if (minimaxResult) {
    minimaxResult.headers.set("X-Voice-Provider", "minimax");
    minimaxResult.headers.set("X-Voice-Degraded", degraded.join(","));
    return minimaxResult;
  }
  degraded.push("minimax");

  // 4. 降级智谱（非流式）
  const zhipuResult = await fallbackZhipu(text);
  if (zhipuResult) {
    zhipuResult.headers.set("X-Voice-Provider", "zhipu");
    zhipuResult.headers.set("X-Voice-Degraded", degraded.join(","));
    return zhipuResult;
  }
  degraded.push("zhipu");

  // 5. 全部失败
  return new Response("All TTS services unavailable", {
    status: 503,
    headers: {
      "X-Voice-Provider": "none",
      "X-Voice-Degraded": degraded.join(","),
    },
  });
}
