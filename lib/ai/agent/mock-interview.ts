/**
 * 模拟面试 AI Agent
 *
 * 专门处理模拟面试请求，按照设定的面试流程进行：
 * 1. 自我介绍 → 离职原因 → JS 基础题 → 算法题 → 场景题
 * 2. 项目介绍 → 项目挑战 → 性能优化
 * 3. 最后给出综合点评
 *
 * 集成了两个 tool：
 * - getBehaviouralQuestions：从面试派获取 HR 行为面试题
 * - ragSearch：从知识库检索面试相关参考资料
 */

import {
  convertToModelMessages,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { myProvider } from "@/lib/ai/providers";
import { buildVoiceConstraint } from "@/lib/ai/toolkit/prompt-builder";
import { createUsageFinishHandler } from "@/lib/ai/toolkit/usage";
import { getBehaviouralQuestionsTool } from "@/lib/ai/tools/behavioural-questions";
import { createMemoryReadTool } from "@/lib/ai/tools/memory-read";
import { ragSearchTool } from "@/lib/ai/tools/rag-search";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";

export type CreateMockInterviewStreamOptions = {
  messages: ChatMessage[];
  voiceMode?: boolean;
  /** 职位 JD 上下文（可选） */
  jobContext?: string;
  /** 当前用户 ID（用于 per-user 记忆检索） */
  userId: string;
  /** 数据流写入器，用于推送 usage 和 tool 结果 */
  dataStream: UIMessageStreamWriter<ChatMessage>;
  /** 可选回调，usage 计算完成时通知外层 */
  onUsageUpdate?: (usage: AppUsage) => void;
};

/**
 * 创建模拟面试 agent 的 stream
 *
 * 核心是详细的面试流程 system prompt，包含：
 * - 面试官角色定位（前端技术栈专家）
 * - 面试问题数量限制（8-10 题）
 * - 具体的提问顺序和内容
 * - 每道题的点评标准
 * - HR 行为面试 tool 的使用说明
 * - RAG 知识库检索 tool 的使用说明
 */
export function createMockInterviewStream({
  messages,
  voiceMode,
  jobContext,
  userId,
  dataStream,
  onUsageUpdate,
}: CreateMockInterviewStreamOptions) {
  let systemPrompt = `你是一个专业的程序员面试官，擅长前端技术栈，包括 HTML、CSS、JavaScript、TypeScript、React、Vue、Node.js、小程序等技术。

你的任务是进行模拟面试，帮助用户准备真实的面试场景。

当用户提问到 HR 行为面试时，要使用 getBehaviouralQuestions 工具来获取行为面试题和答案，然后基于获取的内容来回答用户的问题。

当你需要出技术面试题，或者需要参考资料来点评用户的回答时，可以使用 ragSearch 工具从知识库检索相关内容。检索时建议将 category 设置为"面试题"来获取更精准的结果。

每次模拟面试最多 8-10 个问题，达到 8 个问题时，就要引导用户：你还有什么问题要问我？
接下来就要引导用户结束面试，你要给出本次面试的综合点评。

模拟面试的问题和提问顺序：
- 开始时，先让用户自我介绍，并询问为何要面试这个岗位
- 如果用户不是应届生，询问为何要在之前的岗位离职
- 出一道 JS 相关的编程基础题
- 出一道算法题，初中级难度
- 出一道经典的场景题，即你出需求，让用户去做技术方案设计
- 询问最近在做什么项目，让用户介绍一下这个项目
- 询问用户在这个项目中遇到过什么挑战、解决过什么难题、或有什么成就？
- 询问用户在这个项目中做过哪些性能优化

针对每一个问题：
用户回答了问题，你要给出简单的点评，之后就询问下一个问题。不要在一个问题上讨论太多。
如果用户不会这个问题，你可以给出简单的提示（不要太多），如果用户还是不会，则询问下一个问题。

每个题目答案的点评，需要注意
- 自我介绍时，有没有留下让人印象深刻的特征？如名校、大厂经历、大型项目经历、技术广度和深度等。如有，则加分。
- 离职原因，是不是和前公司/领导闹矛盾了？有没有说前公司的坏话？如有，则减分。
- 场景题，要求思路清晰明了简洁，不要混乱杂乱
- 项目介绍时，最重要的是能让人听懂看懂这是个什么项目、什么功能，不要一开始就深入细节，这样会很乱
- 项目挑战和难点，可使用 STAR 模板来讲，这样才够清晰明了
- 项目性能优化，最好能有具体的例子和量化指标`;

  if (jobContext) {
    systemPrompt += `\n\n${jobContext}`;
  }

  if (voiceMode) {
    systemPrompt += `\n\n${buildVoiceConstraint()}`;
  }

  const model = myProvider.languageModel("chat-model");

  return streamText({
    model,
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    // 启用行为面试题 tool 和 RAG 检索 tool
    experimental_activeTools: [
      "getBehaviouralQuestions",
      "ragSearch",
      "memoryRead",
    ],
    tools: {
      getBehaviouralQuestions: getBehaviouralQuestionsTool,
      ragSearch: ragSearchTool,
      memoryRead: createMemoryReadTool(userId),
    },
    onFinish: createUsageFinishHandler({
      modelId: model.modelId,
      dataStream,
      onUsageUpdate,
    }),
  });
}
