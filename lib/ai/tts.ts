/**
 * TTS 核心函数（服务端可直接调用）
 *
 * 从 api/tts/route.ts 抽取，供 agent stream 内部直接调用，不走 HTTP
 */

/**
 * 清除 Markdown 语法，将文本转为适合 TTS 朗读的纯文本
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // 代码块（含语言标识）
      .replace(/```[\s\S]*?```/g, "")
      // 行内代码
      .replace(/`([^`]+)`/g, "$1")
      // 图片 ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // 链接 [text](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // 标题 ## → 去掉 # 号
      .replace(/^#{1,6}\s+/gm, "")
      // 粗斜体 ***text*** 或 ___text___
      .replace(/(\*{3}|_{3})(.+?)\1/g, "$2")
      // 粗体 **text** 或 __text__
      .replace(/(\*{2}|_{2})(.+?)\1/g, "$2")
      // 斜体 *text* 或 _text_
      .replace(/(\*|_)(.+?)\1/g, "$2")
      // 删除线 ~~text~~
      .replace(/~~(.+?)~~/g, "$1")
      // 无序列表符 - / * / + 开头
      .replace(/^[\s]*[-*+]\s+/gm, "")
      // 有序列表 1. 2. 等
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // 分隔线 --- / *** / ___
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // 引用 > 开头
      .replace(/^>\s+/gm, "")
      // 多余空行压缩
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * 给 PCM 数据添加 WAV 文件头
 */
function pcmToWav(
  pcmData: ArrayBuffer,
  sampleRate = 24_000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const dataLength = pcmData.byteLength;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  Buffer.from(pcmData).copy(buffer, 44);
  return buffer;
}

async function tryMiniMax(text: string): Promise<Buffer | null> {
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
      console.warn("MiniMax TTS failed:", response.status);
      return null;
    }

    const result = await response.json();
    if (result?.base_resp?.status_code !== 0) {
      console.warn("MiniMax TTS error:", result?.base_resp?.status_msg);
      return null;
    }

    const audioHex = result?.data?.audio;
    if (!audioHex) {
      return null;
    }

    return Buffer.from(audioHex, "hex");
  } catch (error) {
    console.warn("MiniMax TTS error:", error);
    return null;
  }
}

async function tryZhipu(text: string): Promise<Buffer | null> {
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
      console.error("GLM-TTS error:", response.status);
      return null;
    }

    const pcmBuffer = await response.arrayBuffer();
    return pcmToWav(pcmBuffer);
  } catch (error) {
    console.error("GLM-TTS error:", error);
    return null;
  }
}

export type TTSResult = {
  /** base64 编码的音频数据 */
  audioBase64: string;
  /** audio/mpeg 或 audio/wav */
  mimeType: string;
  /** 实际使用的 provider */
  provider: string;
  /** 失败的 provider 列表 */
  degraded: string[];
};

/**
 * 合成语音（核心函数，服务端直接调用）
 *
 * 返回 base64 编码的音频数据，或 null（全部失败）
 */
export async function synthesizeSpeech(
  text: string
): Promise<TTSResult | null> {
  const degraded: string[] = [];

  // 1. MiniMax
  const minimaxAudio = await tryMiniMax(text);
  if (minimaxAudio) {
    return {
      audioBase64: minimaxAudio.toString("base64"),
      mimeType: "audio/mpeg",
      provider: "minimax",
      degraded,
    };
  }
  degraded.push("minimax");

  // 2. 智谱
  const zhipuAudio = await tryZhipu(text);
  if (zhipuAudio) {
    return {
      audioBase64: zhipuAudio.toString("base64"),
      mimeType: "audio/wav",
      provider: "zhipu",
      degraded,
    };
  }
  degraded.push("zhipu");

  return null;
}

/**
 * 按句子边界分段文本，并合并小句子以减少 TTS 调用次数
 *
 * 每个 chunk 尽量达到 minChunkSize 字符，但不会跨句子边界拆分
 */
export function splitBySentence(text: string, minChunkSize = 200): string[] {
  // biome-ignore lint/performance/useTopLevelRegex: regex scoped to function
  const SENTENCE_END = /[。！？!?.\n]/;
  const sentences: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (SENTENCE_END.test(char)) {
      const trimmed = current.trim();
      if (trimmed) {
        sentences.push(trimmed);
      }
      current = "";
    }
  }

  // 剩余文本
  const trimmed = current.trim();
  if (trimmed) {
    sentences.push(trimmed);
  }

  // 合并小句子为更大的 chunk
  const chunks: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > minChunkSize) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer}${sentence}` : sentence;
    }
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
}
