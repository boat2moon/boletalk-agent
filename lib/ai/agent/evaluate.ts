/**
 * 面试评估 AI Agent
 *
 * 基于完整对话历史，使用 generateText + 手动 JSON 解析生成结构化评估结果。
 *
 * 关键设计决策：
 * 1. 使用 generateText 而非 generateObject（三个模型的 tool/json mode 都不稳定）
 * 2. 将对话历史作为文本嵌入 prompt（而非 messages 数组），
 *    避免模型误认为自己是对话参与者而继续回答
 * 3. 兼容扁平和嵌套 JSON 格式
 */

import { generateText } from "ai";
import { myProvider } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";

/** 评估结果类型（嵌套结构，用于前端和 DB） */
export type EvaluationResult = {
  scores: {
    technical: number;
    communication: number;
    logic: number;
    project: number;
    overall: number;
  };
  comments: {
    summary: string;
    strengths: string[];
    improvements: string[];
  };
};

// ==================== System Prompt ====================

const evaluationSystemPrompt = `你是一位经验丰富的技术面试官，正在对一场模拟面试进行综合评估。

请根据完整的面试对话记录，从以下维度给出评分（1-10分）和评语：

评分维度：
- **技术能力 (technical)**：编程基础、框架理解、算法能力
- **沟通表达 (communication)**：表达清晰度、逻辑性、简洁性
- **逻辑思维 (logic)**：问题分析、方案设计、推理能力
- **项目理解 (project)**：项目描述清晰度、角色定位、技术深度
- **综合评价 (overall)**：综合考虑以上所有维度

评分标准：
- 1-3分：明显不足，需要大量提升
- 4-5分：基本达标，但有明显改进空间
- 6-7分：表现不错，达到中高级水准
- 8-9分：表现优秀，展现出深厚功底
- 10分：极其出色，接近完美

你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

{
  "technical": 评分数字,
  "communication": 评分数字,
  "logic": 评分数字,
  "project": 评分数字,
  "overall": 评分数字,
  "summary": "一句话总结",
  "strengths": ["优点1", "优点2"],
  "improvements": ["建议1", "建议2"]
}

注意：technical/communication/logic/project/overall 的值必须是 1-10 的整数，不要用对象。`;

// ==================== 工具函数 ====================

/**
 * 从 LLM 输出中提取评分数字
 * 兼容 {technical: 2} 和 {technical: {score: 2, comment: "..."}}
 */
function extractScore(value: unknown): number {
  if (typeof value === "number") {
    return Math.max(1, Math.min(10, value));
  }
  if (typeof value === "object" && value !== null && "score" in value) {
    const score = (value as Record<string, unknown>).score;
    if (typeof score === "number") {
      return Math.max(1, Math.min(10, score));
    }
  }
  return 5;
}

const JSON_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/;
const JSON_OBJECT_RE = /(\{[\s\S]*\})/;

function parseEvaluationJSON(text: string): EvaluationResult {
  const jsonMatch =
    text.match(JSON_CODE_BLOCK_RE) || text.match(JSON_OBJECT_RE);

  if (!jsonMatch) {
    throw new Error(
      `LLM 输出中未找到 JSON。原始输出前500字: ${text.slice(0, 500)}`
    );
  }

  const parsed = JSON.parse(jsonMatch[1].trim());

  return {
    scores: {
      technical: extractScore(parsed.technical),
      communication: extractScore(parsed.communication),
      logic: extractScore(parsed.logic),
      project: extractScore(parsed.project),
      overall: extractScore(parsed.overall),
    },
    comments: {
      summary: typeof parsed.summary === "string" ? parsed.summary : "暂无总结",
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((s: unknown) => typeof s === "string")
        : ["暂无"],
      improvements: Array.isArray(parsed.improvements)
        ? parsed.improvements.filter((s: unknown) => typeof s === "string")
        : ["暂无"],
    },
  };
}

/**
 * 将聊天历史转为可读文本（作为评估材料）
 */
function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "候选人" : "面试官";
      const text = (msg.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      return `【${role}】: ${text || "(无文本内容)"}`;
    })
    .join("\n\n");
}

// ==================== 核心评估函数 ====================

/**
 * 生成面试评估结果
 *
 * 关键设计：将对话历史作为文本放进 prompt（而非 messages 数组），
 * 避免模型误认为自己是对话参与者而继续回答。
 */
export async function generateEvaluation(
  messages: ChatMessage[]
): Promise<EvaluationResult> {
  const transcript = formatTranscript(messages);

  // 最多尝试 2 次（首次 + 1 次重试），覆盖 LLM 返回非法 JSON 的情况
  const MAX_EVAL_ATTEMPTS = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_EVAL_ATTEMPTS; attempt++) {
    const result = await generateText({
      model: myProvider.languageModel("eval-model"),
      system: evaluationSystemPrompt,
      prompt: `以下是完整的面试对话记录，请对候选人的表现进行评估：\n\n${transcript}\n\n请严格按照 JSON 格式输出你的评估结果。`,
      maxRetries: 2,
    });

    console.log(
      `[Evaluate] attempt ${attempt + 1}, LLM raw text length:`,
      result.text.length,
      "| finishReason:",
      result.finishReason
    );

    if (!result.text) {
      lastError = new Error("LLM 未返回任何文本输出");
      continue;
    }

    try {
      return parseEvaluationJSON(result.text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[Evaluate] JSON 解析失败 (attempt ${attempt + 1}):`,
        lastError.message
      );
    }
  }

  throw lastError || new Error("评估生成失败");
}
