/**
 * GitHub 代码分析工具（共享工具层）
 *
 * 拉取候选人的 GitHub 开源项目信息，使用 LLM 进行代码风格和项目质量分析。
 *
 * ═══════════════════════════════════════════════════════════
 * 环境适配说明：
 * - 【当前】直接 API 调用：使用 GitHub REST API（Node fetch），适用于所有环境
 * - 【备选】MCP 版本（已注释）：通过 GitHub MCP Server（stdio transport）调用，
 *    仅适用于长期运行的 Node.js 服务（本地开发、Docker 部署等），
 *    不适用于 Serverless 环境（FC/Lambda），因为 stdio 子进程会被冻结/回收。
 * ═══════════════════════════════════════════════════════════
 */

import { generateObject, tool } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";
import { fetchWithRetry } from "@/lib/utils/retry";

// ─── MCP 版本（仅适用于本地开发 / 长期运行的 Node.js 服务） ─────────
// import { getGitHubMCPClient } from "@/lib/ai/mcp/mcp-clients";
//
// async function callGitHubTool_MCP(
//   toolName: string,
//   args: Record<string, unknown>
// ): Promise<string> {
//   const client = await getGitHubMCPClient();
//   const tools = await client.tools();
//   const targetTool = tools[toolName];
//   if (!targetTool) throw new Error(`GitHub MCP Server 未提供工具: ${toolName}`);
//   const result = await targetTool.execute(args, {
//     messages: [],
//     toolCallId: `github-${toolName}-${Date.now()}`,
//   });
//   return typeof result === "string" ? result : JSON.stringify(result);
// }

// ─── 直接 API 版本（适用于所有环境，包括 Serverless FC） ─────────

const GITHUB_API = "https://api.github.com";

/**
 * 调用 GitHub REST API
 */
async function callGitHubAPI(
  path: string,
  params?: Record<string, string>
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "BoleTalk/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = new URL(`${GITHUB_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const res = await fetchWithRetry(
    url.toString(),
    {
      headers,
      signal: controller.signal,
    },
    { maxRetries: 2, initialDelayMs: 1000 }
  );

  clearTimeout(timeout);

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }

  return res.text();
}

// ─── 分析结果 Schema ──────────────────────────────────

const githubAnalysisSchema = z.object({
  overview: z.string().describe("候选人 GitHub 整体印象概述"),
  codeStyleScore: z.number().describe("代码风格评分 1-10"),
  projectQualityScore: z.number().describe("项目质量评分 1-10"),
  activityScore: z.number().describe("开源活跃度评分 1-10"),
  techStackAnalysis: z.string().describe("主要技术栈分析"),
  highlightProjects: z
    .array(
      z.object({
        name: z.string().describe("项目名称"),
        description: z.string().describe("项目简述"),
        highlight: z.string().describe("技术亮点"),
      })
    )
    .describe("值得关注的亮点项目，最多 3 个"),
  suggestedQuestions: z
    .array(z.string())
    .describe("基于代码分析的建议面试追问方向，3-5 条"),
});

export type GitHubAnalysisResult = z.infer<typeof githubAnalysisSchema>;

// ─── 核心分析函数 ──────────────────────────────────────

async function analyzeGitHubProfile(
  githubUsername: string,
  repoName?: string
): Promise<GitHubAnalysisResult> {
  const dataPoints: string[] = [];

  try {
    // 1. 搜索用户的仓库
    const reposData = await callGitHubAPI("/search/repositories", {
      q: repoName
        ? `user:${githubUsername} ${repoName}`
        : `user:${githubUsername}`,
      sort: "updated",
      per_page: "10",
    });
    dataPoints.push(`## 仓库列表\n${reposData}`);
  } catch (err) {
    console.error("[GitHub] 搜索仓库失败:", err);
    dataPoints.push("## 仓库列表\n（搜索失败）");
  }

  // 如果指定了仓库，拉取更详细的信息
  if (repoName) {
    try {
      const readmeRes = await callGitHubAPI(
        `/repos/${githubUsername}/${repoName}/readme`
      );
      const readmeJson = JSON.parse(readmeRes) as { content?: string };
      if (readmeJson.content) {
        const decoded = Buffer.from(readmeJson.content, "base64").toString(
          "utf-8"
        );
        dataPoints.push(`## README.md\n${decoded.slice(0, 3000)}`);
      }
    } catch {
      // README 可能不存在，忽略
    }

    try {
      const commitsData = await callGitHubAPI(
        `/repos/${githubUsername}/${repoName}/commits`,
        { per_page: "10" }
      );
      dataPoints.push(`## 最近提交\n${commitsData.slice(0, 3000)}`);
    } catch {
      // 忽略
    }

    try {
      const pkgRes = await callGitHubAPI(
        `/repos/${githubUsername}/${repoName}/contents/package.json`
      );
      const pkgJson = JSON.parse(pkgRes) as { content?: string };
      if (pkgJson.content) {
        const decoded = Buffer.from(pkgJson.content, "base64").toString(
          "utf-8"
        );
        dataPoints.push(`## package.json\n${decoded}`);
      }
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
        `[GitHub] 开始分析: ${githubUsername}${repoName ? `/${repoName}` : ""}`
      );

      const analysis = await analyzeGitHubProfile(githubUsername, repoName);

      console.log(
        `[GitHub] 分析完成: 代码风格=${analysis.codeStyleScore}, 项目质量=${analysis.projectQualityScore}`
      );

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
      console.error("[GitHub] 分析失败:", message);
      return `GitHub 分析失败: ${message}。可以稍后重试，或者请候选人直接介绍他们的项目。`;
    }
  },
});
