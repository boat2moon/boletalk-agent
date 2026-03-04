/**
 * 统一 Prompt 构建器
 *
 * 将分散在各 Agent 和 API 路由中的重复 Prompt 片段提取到此处，
 * 通过组合模式按需构建不同模式的 System Prompt。
 *
 * 共享片段：
 * - BASE_INTERVIEWER_ROLE: 面试官角色基础描述
 * - INTERVIEW_FLOW: 面试流程模板
 * - VOICE_CONSTRAINTS: 语音模式约束
 * - AVATAR_CONSTRAINTS: 数字人播报专用约束
 *
 * 提供的构建函数：
 * - buildInterviewPrompt(): 为 Phone / Avatar 模式构建完整面试 Prompt
 * - buildVoiceConstraint(): 为 Text Agent 的语音模式追加约束
 */

// ==================== 共享 Prompt 片段 ====================

/**
 * 面试官角色基础描述
 * 供所有面试场景复用
 */
export const BASE_INTERVIEWER_ROLE =
  "你是一个专业的程序员面试官，擅长前端技术栈，包括 HTML、CSS、JavaScript、TypeScript、React、Vue、Node.js、小程序等技术。";

/**
 * 通用面试流程模板
 * Phone / Avatar 共用，mock-interview 有自己更详细的版本
 */
export const INTERVIEW_FLOW = `模拟面试流程：
- 先让候选人自我介绍
- 询问离职原因（如果不是应届生）
- 出 2-3 道技术题（JS 基础、算法、场景设计）
- 询问项目经历和挑战
- 最后给出综合点评

每道题候选人回答后，给出简短点评，然后继续下一题。
全程最多 8-10 个问题，之后引导结束面试。`;

/**
 * 语音模式通用约束
 * 用于 Voice 模式下追加到各 Agent 的 system prompt
 */
export const VOICE_CONSTRAINTS =
  "[语音模式特殊要求]：用户正在通过语音与你交流。你的回答必须口语化、简洁自然，就像面对面聊天一样。请绝对避免生成复杂的 Markdown 格式（如长列表、表格、代码块等），尽量用纯文本交流。直接给结论，不要超过 3-5 句。";

/**
 * 语音输出通用约束（回复直接转为语音/播报）
 * Phone / Avatar 共用
 */
const SPEECH_OUTPUT_CONSTRAINTS = `1. 你的回复会直接转为语音播放，所以要口语化、自然、简洁
2. 不要使用 Markdown 格式、代码块、表格等文字格式
3. 每次回复控制在 3-5 句话以内
4. 说话要像真实面试官一样，有亲和力但专业`;

/**
 * 数字人播报额外约束（Avatar 专用，叠加在语音输出约束之上）
 */
const AVATAR_EXTRA_CONSTRAINTS =
  "5. 不要在回复中出现括号说明、表情符号等非语音内容";

// ==================== Prompt 构建函数 ====================

/** Phone / Avatar 面试 Prompt 的模式类型 */
export type InterviewMode = "phone" | "avatar";

export type BuildInterviewPromptOptions = {
  /** 交互模式：phone（实时语音）或 avatar（数字人） */
  mode: InterviewMode;
  /** 可选的简历分析上下文（由 resume-analyzer 生成） */
  resumeContext?: string;
};

/**
 * 为 Phone / Avatar 模式构建完整的面试官 System Prompt
 *
 * 组合逻辑：
 * - 基础角色 + 场景描述 + 语音约束 + (Avatar 额外约束) + 面试流程 + (简历上下文)
 *
 * 设计说明：
 * Phone 和 Avatar 的 Prompt 基本共享，通过 mode 参数控制差异点。
 * 如需未来独立演进，可在此基础上扩展 mode-specific 的分支逻辑。
 */
export function buildInterviewPrompt({
  mode,
  resumeContext,
}: BuildInterviewPromptOptions): string {
  const sceneDescription =
    mode === "avatar"
      ? "你正在通过视频进行一对一的模拟面试。请注意以下要求："
      : "你正在进行一对一的实时语音模拟面试。请注意以下要求：";

  const constraints =
    mode === "avatar"
      ? `${SPEECH_OUTPUT_CONSTRAINTS}\n${AVATAR_EXTRA_CONSTRAINTS}`
      : SPEECH_OUTPUT_CONSTRAINTS;

  let prompt = `${BASE_INTERVIEWER_ROLE}\n\n${sceneDescription}\n\n${constraints}\n\n${INTERVIEW_FLOW}`;

  if (resumeContext) {
    prompt += `\n\n${resumeContext}`;
  }

  return prompt;
}

/**
 * 为现有 Agent（Text/Voice）的语音模式构建约束后缀
 *
 * 用法：在各 Agent 的 system prompt 末尾追加
 * ```
 * if (voiceMode) systemPrompt += '\n\n' + buildVoiceConstraint();
 * ```
 */
export function buildVoiceConstraint(): string {
  return VOICE_CONSTRAINTS;
}
