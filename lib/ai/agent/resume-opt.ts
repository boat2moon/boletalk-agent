/**
 * 简历优化 AI Agent
 *
 * 专门处理简历相关的用户请求，包括：
 * 1. 没有简历时 → 提示用户粘贴简历内容
 * 2. 需要简历模板时 → 调用 getResumeTemplate tool 获取模板
 * 3. 已有简历内容时 → 从多个维度评审并给出优化建议
 *
 * 集成了 getResumeTemplate tool（获取简历模板）
 * scoreSkills tool 已定义但暂时注释掉（参考实现中也注释了，调用有问题）
 */

import {
  convertToModelMessages,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { myProvider } from "@/lib/ai/providers";
import { buildVoiceConstraint } from "@/lib/ai/toolkit/prompt-builder";
import { createUsageFinishHandler } from "@/lib/ai/toolkit/usage";
// import { scoreSkills } from "@/lib/ai/tools/score-skills";
import { getResumeTemplateTool } from "@/lib/ai/tools/resume-template";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";

export type CreateResumeOptStreamOptions = {
  messages: ChatMessage[];
  /** 用户选择的对话模型 ID */
  selectedChatModel: string;
  voiceMode?: boolean;
  /** 数据流写入器，用于推送 usage 和 tool 结果 */
  dataStream: UIMessageStreamWriter<ChatMessage>;
  /** 可选回调，usage 计算完成时通知外层 */
  onUsageUpdate?: (usage: AppUsage) => void;
};

/**
 * 创建简历优化 agent 的 stream
 *
 * 核心是一个精心设计的 system prompt，包含：
 * - 角色定义：资深程序员 + 简历优化专家
 * - 无简历时的引导策略
 * - 简历模板 tool 的使用说明
 * - 详细的评审维度（教育、技能、工作、项目）
 * - 具体的优化建议规则
 * - 回复格式要求（先点评再建议）
 */
export function createResumeOptStream({
  messages,
  selectedChatModel,
  voiceMode,
  dataStream,
  onUsageUpdate,
}: CreateResumeOptStreamOptions) {
  let systemPrompt = `你的角色是：资深程序员 + 简历优化专家，最擅长程序员简历的评审和优化。

请根据用户的消息内容，判断用户是否已经提供了简历内容：

1. **如果用户还没有提供简历内容**：
   - 友好地提示用户把简历文本内容粘贴输入到这里
   - 要求内容完整
   - 提醒用户隐藏个人信息（如姓名、电话、邮箱等敏感信息）
   - 说明后续会如何帮助评审和优化简历

2. 如果用户想要简历模板，直接调用 getResumeTemplate 工具获取简历模板，你不要自己生成简历模板。

3. **如果用户已经提供了简历内容**：
   
   **评审简历需要关注以下方面：**
   - 毕业学校是否有优势，专业是否是计算机相关专业。毕业时间越短，学校的影响越大
   - 技能的深度和广度，是否和毕业时间、工作经验相匹配
   - 工作经历中，是否有大公司经历
   - 项目经验中，是否有大规模项目，是否担当过项目负责人，是否体现出自己在项目中的价值、亮点、成绩
   - 是否有写明自己的技术优势？和同龄人相比
   
   **优化简历需要注意：**
   - 如果是专科学校或非计算机专业，可以暂时隐藏教育经历。专升本的可只写"本科"隐藏教育经历
   - 专业技能中，不要写"了解xx技术"，要么写"熟悉xx技术"，要么不写
   - 工作经验中，要写出自己在这家公司的具体工作成果，不要记录流水账、无用的废话
   - 项目经验中，项目建议在 3-5 个之间，根据毕业时间和工作经验来定
   - 项目经验中，第一个项目一定要是最重要的、最具有代表性的项目，项目的内容要丰富，要能体现出亮点和成绩
   - 描述项目职责和工作时，尽量要有量化数据，要适当举例，要写明技术名词（你是一名技术人员）
   - 项目职责可参考模板：用 xxx 技术，实现 xxx 功能/解决 xxx 问题，达成 xxx 效果
   - 要总结出自己的技术优势，和同龄人相比，自己的优势是什么，2-3 点即可
  
   
   **回复格式要求：**
   - 先给出点评
    - 综合评分（5-10分）
    - 优点
    - 不足
   - 然后给出具体的修改建议
`;

  if (voiceMode) {
    systemPrompt += `\n\n${buildVoiceConstraint()}`;
  }

  const model = myProvider.languageModel(selectedChatModel);

  return streamText({
    model,
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    // 启用 getResumeTemplate tool，scoreSkills 暂时注释（参考实现中也是注释状态）
    experimental_activeTools: [
      // "scoreSkills",
      "getResumeTemplate",
    ],
    tools: {
      // scoreSkills,
      getResumeTemplate: getResumeTemplateTool,
    },
    onFinish: createUsageFinishHandler({
      modelId: model.modelId,
      dataStream,
      onUsageUpdate,
    }),
  });
}
