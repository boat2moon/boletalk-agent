/**
 * HR 行为面试题 Tool
 *
 * 当模拟面试中用户提问到 HR 行为面试时，
 * AI 会调用此 tool 从面试派网站获取最新的行为面试题和答案。
 *
 * 数据来源：面试派（mianshipai）开源项目的 GitHub 仓库
 * 通过 fetch 请求获取 markdown 格式的面试题内容
 */

import { tool } from "ai";
import { z } from "zod";

/** 面试派行为面试题的 GitHub Raw 链接 */
const BEHAVIOURAL_QUESTIONS_URL =
  "https://raw.githubusercontent.com/mianshipai/mianshipai-web/refs/heads/main/docs/hr-exam/behavioural-test.md";

/**
 * 从面试派 GitHub 仓库获取行为面试题内容
 * 返回 markdown 格式的面试题文本
 */
async function fetchBehaviouralQuestions(): Promise<string> {
  try {
    const response = await fetch(BEHAVIOURAL_QUESTIONS_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch behavioural questions: ${response.status} ${response.statusText}`
      );
    }
    const content = await response.text();
    return content;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    throw new Error(`Error fetching behavioural questions: ${errorMessage}`);
  }
}

/**
 * 行为面试题 tool 定义
 *
 * 无需输入参数，直接从 GitHub 获取最新内容并返回。
 * AI 拿到内容后会基于这些真实面试题来回答用户的问题。
 */
export const getBehaviouralQuestionsTool = tool({
  description:
    "获取 HR 行为面试题和答案。当用户提问到 HR 行为面试时，使用此工具从 GitHub 获取最新的行为面试题和答案列表。",
  inputSchema: z.object({}),
  execute: async () => {
    const content = await fetchBehaviouralQuestions();
    return {
      content,
    };
  },
});
