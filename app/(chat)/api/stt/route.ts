/**
 * STT API 路由
 * 优先使用极速的 Groq (Whisper-large-v3) 将音频转为文本
 * 失败则自动降级到智谱 GLM-ASR
 * 响应头包含 X-Voice-Provider 和 X-Voice-Degraded 供前端健康追踪
 */

export const maxDuration = 30;

/**
 * 尝试通过 Groq API (Whisper-large-v3) 识别
 */
async function tryGroqWhisper(audioFile: File): Promise<Response | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("file", audioFile, audioFile.name || "recording.wav");
    formData.append("model", "whisper-large-v3");
    formData.append("language", "zh");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("Groq Whisper API error:", response.status, errorText);
      return null;
    }

    const result = await response.json();
    if (result?.text) {
      return Response.json({ text: result.text });
    }

    console.warn("Groq returned empty result", result);
    return null;
  } catch (error) {
    console.warn("Groq STT error:", error);
    return null;
  }
}

/**
 * 降级使用智谱 GLM-ASR
 */
async function fallbackZhipuAsr(audioFile: File): Promise<Response | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const asrFormData = new FormData();
    asrFormData.append("model", "glm-asr");
    asrFormData.append("file", audioFile, "recording.wav");
    asrFormData.append("language", "zh");

    const response = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: asrFormData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GLM-ASR API error:", response.status, errorText);
      return null;
    }

    const result = await response.json();
    return Response.json({ text: result.text || "" });
  } catch (error) {
    console.error("GLM-ASR error:", error);
    return null;
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return new Response("Missing audio file", { status: 400 });
  }

  const degraded: string[] = [];

  // 1. 优先 Groq
  const groqResult = await tryGroqWhisper(audioFile);
  if (groqResult) {
    groqResult.headers.set("X-Voice-Provider", "groq");
    return groqResult;
  }
  degraded.push("groq");

  // 2. 降级到智谱（不支持 webm）
  const fileName = audioFile.name || "";
  if (!fileName.endsWith(".webm")) {
    const zhipuResult = await fallbackZhipuAsr(audioFile);
    if (zhipuResult) {
      zhipuResult.headers.set("X-Voice-Provider", "zhipu");
      zhipuResult.headers.set("X-Voice-Degraded", degraded.join(","));
      return zhipuResult;
    }
  }
  degraded.push("zhipu");

  // 3. 全部失败
  return new Response("All STT services unavailable", {
    status: 503,
    headers: {
      "X-Voice-Provider": "none",
      "X-Voice-Degraded": degraded.join(","),
    },
  });
}
