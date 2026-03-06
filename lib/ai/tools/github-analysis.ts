/**
 * GitHub 代码分析工具（共享工具/MCP 层）
 *
 * 通过 GitHub MCP Server 拉取候选人的开源项目信息，
 * 然后使用 LLM 进行代码风格和项目质量分析。
 *
 * 使用场景：
 * - 面试中 Agent 按需分析候选人的 GitHub 项目
 * - 评价代码风格、项目活跃度、技术栈深度
 * - 生成针对性面试问题
 *
 * 数据流：
 *   Agent 调用 githubAnalysis Tool
 *   → MCP Client 连接 GitHub MCP Server
 *   → 拉取仓库列表 / 文件内容
 *   → LLM 分析代码质量
 *   → 返回结构化评价
 */

import { generateObject, tool } from "ai";
import { z } from "zod";
import { getGitHubMCPClient } from "@/lib/ai/mcp/mcp-clients";
import { myProvider } from "@/lib/ai/providers";

// ─── 分析结果 Schema ──────────────────────────────────

const githubAnalysisSchema = z.object({
  /** 候选人 GitHub 总体评价 */
  overview: z.string().describe("候选人 GitHub 整体印象概述"),
  /** 代码风格评分 1-10 */
  codeStyleScore: z.number().describe("代码风格评分 1-10"),
  /** 项目质量评分 1-10 */
  projectQualityScore: z.number().describe("项目质量评分 1-10"),
  /** 活跃度评分 1-10 */
  activityScore: z.number().describe("开源活跃度评分 1-10"),
  /** 技术栈分析 */
  techStackAnalysis: z.string().describe("主要技术栈分析"),
  /** 亮点项目 */
  highlightProjects: z
    .array(
      z.object({
        name: z.string().describe("项目名称"),
        description: z.string().describe("项目简述"),
        highlight: z.string().describe("技术亮点"),
      })
    )
    .describe("值得关注的亮点项目，最多 3 个"),
  /** 建议的面试追问方向 */
  suggestedQuestions: z
    .array(z.string())
    .describe("基于代码分析的建议面试追问方向，3-5 条"),
});

export type GitHubAnalysisResult = z.infer<typeof githubAnalysisSchema>;

// ─── MCP 工具调用辅助 ─────────────────────────────────

/**
 * 通过 MCP 调用 GitHub Server 的指定工具
 */
async function callGitHubTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const client = await getGitHubMCPClient();
  const tools = await client.tools();

  const targetTool = tools[toolName];
  if (!targetTool) {
    throw new Error(`GitHub MCP Server 未提供工具: ${toolName}`);
  }

  // 通过 tool 的 execute 调用 MCP Server
  const result = await targetTool.execute(args, {
    messages: [],
    toolCallId: `github-${toolName}-${Date.now()}`,
  });
  return typeof result === "string" ? result : JSON.stringify(result);
}

// ─── 核心分析函数 ──────────────────────────────────────

/**
 * 拉取并分析候选人的 GitHub 项目
 */
async function analyzeGitHubProfile(
  githubUsername: string,
  repoName?: string
): Promise<GitHubAnalysisResult> {
  const dataPoints: string[] = [];

  try {
    // 1. 搜索用户的仓库
    const reposData = await callGitHubTool("search_repositories", {
      query: repoName
        ? `user:${githubUsername} ${repoName}`
        : `user:${githubUsername}`,
    });
    dataPoints.push(`## 仓库列表\n${reposData}`);
  } catch (err) {
    console.error("[GitHub MCP] 搜索仓库失败:", err);
    dataPoints.push("## 仓库列表\n（搜索失败）");
  }

  // 如果指定了仓库，拉取更详细的信息
  if (repoName) {
    try {
      // 尝试获取 README
      const readmeData = await callGitHubTool("get_file_contents", {
        owner: githubUsername,
        repo: repoName,
        path: "README.md",
      });
      dataPoints.push(`## README.md\n${readmeData}`);
    } catch {
      // README 可能不存在，忽略
    }

    try {
      // 获取最近的提交
      const commitsData = await callGitHubTool("list_commits", {
        owner: githubUsername,
        repo: repoName,
      });
      dataPoints.push(`## 最近提交\n${commitsData}`);
    } catch {
      // 忽略
    }

    try {
      // 获取 package.json（如果存在）来分析技术栈
      const pkgData = await callGitHubTool("get_file_contents", {
        owner: githubUsername,
        repo: repoName,
        path: "package.json",
      });
      dataPoints.push(`## package.json\n${pkgData}`);
    } catch {
      // 可能不是 JS 项目，忽略
    }
  }

  // 2. 使用 LLM 分析收集到的数据
  const analysisPrompt = `以下是候选人 ${githubUsername} 的 GitHub 项目数据：

${dataPoints.join("\n\n---\n\n")}

请基于以上数据，对候选人的 GitHub 开源项目进行全面评估。`;

  const result = await generateObject({
    model: myProvider.languageModel("internal-model"),
    system: `你是一位资深技术面试官，擅长通过 GitHub 开源项目评估候选人的技术水平。
请从以下维度进行分析：
1. 代码风格：命名规范、代码组织、注释质量等
2. 项目质量：架构设计、功能完整度、测试覆盖等
3. 活跃度：提交频率、维护状态等
4. 技术栈深度：使用的技术和框架的复杂度

评分标准（1-10）：
- 1-3：基础，学习阶段
- 4-6：有一定经验，但深度不够
- 7-8：经验丰富，有技术追求
- 9-10：专家级别`,
    prompt: analysisPrompt,
    schema: githubAnalysisSchema,
  });

  return result.object;
}

// ─── Agent Tool 定义 ─────────────────────────────────

/**
 * GitHub 代码分析 Tool
 *
 * 面试 Agent 可在对话中调用此工具，分析候选人的 GitHub 开源项目。
 * 结果会作为会话上下文的一部分，在评估时自动写入记忆系统。
 */
export const githubAnalysisTool = tool({
  description:
    "分析候选人的 GitHub 开源项目，评价代码风格和项目质量。当候选人提到 GitHub 用户名或仓库链接时使用此工具。",
  inputSchema: z.object({
    githubUsername: z.string().describe("GitHub 用户名"),
    repoName: z
      .string()
      .optional()
      .describe("指定要分析的仓库名，不传则分析用户的整体 GitHub"),
  }),
  execute: async ({ githubUsername, repoName }) => {
    try {
      console.log(
        `[GitHub MCP] 开始分析: ${githubUsername}${repoName ? `/${repoName}` : ""}`
      );

      const analysis = await analyzeGitHubProfile(githubUsername, repoName);

      console.log(
        `[GitHub MCP] 分析完成: 代码风格=${analysis.codeStyleScore}, 项目质量=${analysis.projectQualityScore}`
      );

      // 格式化为面试官可引用的文本
      const formattedResult = `
【GitHub 项目分析结果 - ${githubUsername}${repoName ? `/${repoName}` : ""}】

📊 评分：
- 代码风格: ${analysis.codeStyleScore}/10
- 项目质量: ${analysis.projectQualityScore}/10
- 活跃度: ${analysis.activityScore}/10

📝 概述: ${analysis.overview}

🔧 技术栈: ${analysis.techStackAnalysis}

⭐ 亮点项目:
${analysis.highlightProjects.map((p) => `- ${p.name}: ${p.description}（亮点: ${p.highlight}）`).join("\n")}

💡 建议追问方向:
${analysis.suggestedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
`.trim();

      return formattedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      console.error("[GitHub MCP] 分析失败:", message);
      return `GitHub 分析失败: ${message}。可以稍后重试，或者请候选人直接介绍他们的项目。`;
    }
  },
});
