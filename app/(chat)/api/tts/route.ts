/**
 * TTS API 路由
 * 优先使用 MiniMax Speech-02，降级到智谱 GLM-TTS
 * 响应头包含 X-Voice-Provider 和 X-Voice-Degraded 供前端健康追踪
 */

export const maxDuration = 60;

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
    const response = await fetch("https://api.minimaxi.com/v1/t2a_v2", {
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
    });

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

  // 1. 优先 MiniMax
  const minimaxResult = await tryMiniMax(text);
  if (minimaxResult) {
    minimaxResult.headers.set("X-Voice-Provider", "minimax");
    return minimaxResult;
  }
  degraded.push("minimax");

  // 2. 降级智谱
  const zhipuResult = await fallbackZhipu(text);
  if (zhipuResult) {
    zhipuResult.headers.set("X-Voice-Provider", "zhipu");
    zhipuResult.headers.set("X-Voice-Degraded", degraded.join(","));
    return zhipuResult;
  }
  degraded.push("zhipu");

  // 3. 全部失败
  return new Response("All TTS services unavailable", {
    status: 503,
    headers: {
      "X-Voice-Provider": "none",
      "X-Voice-Degraded": degraded.join(","),
    },
  });
}
