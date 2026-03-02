/**
 * 简历分析 Agent（用于高级语音模拟面试的准备阶段）
 *
 * 工作流程：
 * 1. 接收用户上传的简历文本
 * 2. 使用便宜的文本模型（chat-model-glm）分析简历
 * 3. 输出结构化的面试上下文
 * 4. 该上下文会被注入到 Realtime 模型的 system prompt 中
 *
 * 这样做的好处：
 * - 复用文本模型的分析能力，成本极低
 * - 生成的结构化数据可以让 Realtime 面试官有针对性地提问
 * - 是连接"文本 Agent 世界"和"Realtime 语音世界"的桥梁
 */

import { generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";

/**
 * 简历分析结果的 zod schema
 *
 * 使用 generateObject 让 AI 输出符合此结构的 JSON
 */
const resumeAnalysisSchema = z.object({
  /** 候选人背景一句话总结 */
  summary: z.string().describe("候选人的背景和核心竞争力一句话总结"),
  /** 预估工作年限 */
  experienceYears: z.number().describe("候选人的预估工作年限"),
  /** 技术栈列表 */
  techStack: z
    .array(z.string())
    .describe("候选人掌握的主要技术栈，按熟练度排序"),
  /** 简历亮点 */
  strengths: z
    .array(z.string())
    .describe("简历中的亮点和优势，最多 5 条"),
  /** 简历不足 */
  weaknesses: z
    .array(z.string())
    .describe("简历中的不足或待改进点，最多 5 条"),
  /** 建议的面试方向 */
  suggestedInterviewDirections: z
    .array(
      z.object({
        topic: z.string().describe("面试方向主题"),
        question: z.string().describe("建议提出的具体问题"),
        reason: z.string().describe("为什么要问这个问题"),
      })
    )
    .describe("基于简历内容，建议的面试提问方向，5-8 条"),
});

/** 简历分析结果类型 */
export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;

/**
 * 分析简历并生成结构化面试上下文
 *
 * @param resumeText - 纯文本格式的简历内容
 * @returns 结构化的简历分析结果
 */
export async function analyzeResume(
  resumeText: string
): Promise<ResumeAnalysis> {
  const result = await generateObject({
    model: myProvider.languageModel("chat-model-glm"),
    system: `你是一个资深的技术面试官，擅长分析程序员简历并设计有针对性的面试策略。

请仔细阅读以下简历内容，生成结构化的分析结果。你的分析将用于指导实时语音模拟面试，让面试官能够有针对性地提问。

分析要求：
1. summary：一句话精准概括候选人的背景和核心竞争力
2. experienceYears：根据工作经历推算工作年限
3. techStack：提取主要技术栈，按简历中体现的熟练度排序
4. strengths：找出简历中的亮点（大厂经历、技术深度、项目成果等）
5. weaknesses：找出简历中的不足（缺少量化数据、项目描述模糊等）
6. suggestedInterviewDirections：基于简历内容，设计 5-8 个有针对性的面试问题
   - 问题应该围绕候选人实际做过的项目和技术
   - 要包含追问方向（如性能优化细节、架构决策原因等）
   - 要有难度梯度（基础 → 深入 → 开放性问题）`,
    prompt: `以下是候选人的简历内容：\n\n${resumeText}`,
    schema: resumeAnalysisSchema,
  });

  return result.object;
}

/**
 * 将简历分析结果转换为 Realtime 面试官的 system prompt 片段
 *
 * 这个 prompt 会被注入到 Gemini Live API 的 systemInstruction 中
 */
export function buildRealtimePromptFromAnalysis(
  analysis: ResumeAnalysis
): string {
  const directions = analysis.suggestedInterviewDirections
    .map(
      (d, i) =>
        `${i + 1}. 方向：${d.topic}\n   问题：${d.question}\n   原因：${d.reason}`
    )
    .join("\n");

  return `
【候选人简历分析】
- 概况：${analysis.summary}
- 工作年限：约 ${analysis.experienceYears} 年
- 技术栈：${analysis.techStack.join("、")}
- 亮点：${analysis.strengths.join("；")}
- 待考察点：${analysis.weaknesses.join("；")}

【建议的面试方向】
${directions}

【面试策略】
- 基于以上分析，请围绕候选人的实际经历提问，不要泛泛而谈
- 先从自我介绍开始，然后根据候选人的回答灵活调整问题顺序
- 每道题让候选人回答后，给出简短点评，然后继续下一题
- 如果候选人说不会，给一个简短提示，还不会就继续下一题
- 最后给出综合评价
`.trim();
}
