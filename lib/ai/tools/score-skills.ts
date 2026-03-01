/**
 * 技能评分 Tool
 *
 * 根据毕业时间和技能列表，对简历中的技能进行综合评分。
 * 评审规则：毕业时间越久，工作经验越多，技能应该越多、应用越深入。
 * 打分范围：5-10分。
 *
 * 注意：此 tool 在 resume-opt.ts 中暂时被注释掉了，
 * 因为参考实现中调用 tool 后前端没有响应（疑似框架兼容性问题）。
 * 保留代码以备后续使用。
 */

import { tool } from "ai";
import { z } from "zod";

// ==================== 正则表达式提升到模块顶层（biome lint 要求）====================
const BACKEND_REGEX = /java|spring|python|node|go|rust|c\+\+|php|ruby/i;
const BACKEND_CN_REGEX = /后端|server|backend/i;
const FRONTEND_REGEX = /react|vue|angular|javascript|typescript|html|css/i;
const FRONTEND_CN_REGEX = /前端|frontend|web/i;
const DATABASE_REGEX = /mysql|postgresql|mongodb|redis|elasticsearch|oracle/i;
const DATABASE_CN_REGEX = /数据库|database|db/i;
const DEVOPS_REGEX = /docker|kubernetes|k8s|jenkins|git|ci\/cd|linux/i;
const DEVOPS_CN_REGEX = /运维|devops|部署/i;
const CLOUD_REGEX = /aws|azure|gcp|aliyun|腾讯云|华为云/i;

/**
 * 技能评分 tool 定义
 *
 * 输入：
 * - graduationYear: 毕业年份（如 2020）
 * - skills: 技能列表（如 ['Java', 'Spring Boot', 'MySQL']）
 *
 * 输出：
 * - score: 综合评分（5-10）
 * - suggestion: 评分理由和改进建议
 */
export const scoreSkills = tool({
  description:
    "对简历中的技能进行评分。根据毕业时间和技能列表，评估技能的深度和广度是否与工作经验相匹配。",
  inputSchema: z.object({
    graduationYear: z
      .number()
      .int()
      .min(1950)
      .max(2100)
      .describe("毕业年份（例如：2020）"),
    skills: z
      .array(z.string())
      .min(1)
      .describe("技能列表，例如：['Java', 'Spring Boot', 'MySQL', 'Redis']"),
  }),
  execute: ({ graduationYear, skills }) => {
    console.log("scoreSkills...");
    const currentYear = new Date().getFullYear();
    const yearsOfExperience = currentYear - graduationYear;
    const skillCount = skills.length;

    let score = 5;
    let feedback = "";

    // 根据工作年限评估期望的技能数量
    let expectedSkillCount = 0;
    if (yearsOfExperience <= 1) {
      expectedSkillCount = 5;
    } else if (yearsOfExperience <= 3) {
      expectedSkillCount = 8;
    } else if (yearsOfExperience <= 5) {
      expectedSkillCount = 12;
    } else if (yearsOfExperience <= 8) {
      expectedSkillCount = 15;
    } else {
      expectedSkillCount = 18;
    }

    // ==================== 技能数量评分（40% 权重）====================
    const skillCountRatio = skillCount / expectedSkillCount;
    let skillCountScore = 5;
    if (skillCountRatio >= 1.2) {
      skillCountScore = 10;
      feedback += "技能数量丰富，远超同工作年限的期望值。";
    } else if (skillCountRatio >= 1.0) {
      skillCountScore = 9;
      feedback += "技能数量充足，符合工作年限。";
    } else if (skillCountRatio >= 0.8) {
      skillCountScore = 7;
      feedback += `技能数量略少，建议补充更多技能（当前${skillCount}个，建议${expectedSkillCount}个左右）。`;
    } else if (skillCountRatio >= 0.6) {
      skillCountScore = 6;
      feedback += `技能数量不足，与${yearsOfExperience}年工作经验不匹配（当前${skillCount}个，建议${expectedSkillCount}个左右）。`;
    } else {
      skillCountScore = 5;
      feedback += `技能数量严重不足，需要大幅补充技能（当前${skillCount}个，建议${expectedSkillCount}个左右）。`;
    }

    // ==================== 技能深度评估（60% 权重）====================
    const hasBackendSkills =
      skills.some((skill) => BACKEND_REGEX.test(skill)) ||
      skills.some((skill) => BACKEND_CN_REGEX.test(skill));
    const hasFrontendSkills =
      skills.some((skill) => FRONTEND_REGEX.test(skill)) ||
      skills.some((skill) => FRONTEND_CN_REGEX.test(skill));
    const hasDatabaseSkills =
      skills.some((skill) => DATABASE_REGEX.test(skill)) ||
      skills.some((skill) => DATABASE_CN_REGEX.test(skill));
    const hasDevOpsSkills =
      skills.some((skill) => DEVOPS_REGEX.test(skill)) ||
      skills.some((skill) => DEVOPS_CN_REGEX.test(skill));
    const hasCloudSkills = skills.some((skill) => CLOUD_REGEX.test(skill));

    const skillCategoryCount =
      (hasBackendSkills ? 1 : 0) +
      (hasFrontendSkills ? 1 : 0) +
      (hasDatabaseSkills ? 1 : 0) +
      (hasDevOpsSkills ? 1 : 0) +
      (hasCloudSkills ? 1 : 0);

    let skillDepthScore = 5;
    if (yearsOfExperience <= 1) {
      if (skillCategoryCount >= 2) {
        skillDepthScore = 9;
        feedback += "技能广度良好，覆盖多个技术领域。";
      } else if (skillCategoryCount >= 1) {
        skillDepthScore = 7;
        feedback += "建议扩展技能广度，学习更多技术栈。";
      } else {
        skillDepthScore = 5;
        feedback += "技能广度不足，需要学习核心技术栈。";
      }
    } else if (yearsOfExperience <= 3) {
      if (skillCategoryCount >= 3) {
        skillDepthScore = 10;
        feedback += "技能广度优秀，技术栈覆盖全面。";
      } else if (skillCategoryCount >= 2) {
        skillDepthScore = 8;
        feedback += "技能广度良好，建议继续扩展。";
      } else {
        skillDepthScore = 6;
        feedback += "技能广度不足，建议学习更多技术栈。";
      }
    } else if (yearsOfExperience <= 5) {
      if (skillCategoryCount >= 4) {
        skillDepthScore = 10;
        feedback += "技能广度优秀，技术栈覆盖全面。";
      } else if (skillCategoryCount >= 3) {
        skillDepthScore = 8;
        feedback += "技能广度良好，符合工作年限。";
      } else {
        skillDepthScore = 6;
        feedback += "技能广度不足，建议扩展更多技术领域。";
      }
    } else if (skillCategoryCount >= 5) {
      skillDepthScore = 10;
      feedback += "技能广度优秀，技术栈覆盖全面，符合资深开发者水平。";
    } else if (skillCategoryCount >= 4) {
      skillDepthScore = 9;
      feedback += "技能广度良好，建议继续扩展。";
    } else {
      skillDepthScore = 7;
      feedback += "技能广度需要提升，资深开发者应掌握更多技术栈。";
    }

    // ==================== 综合评分 ====================
    score = Math.round(skillCountScore * 0.4 + skillDepthScore * 0.6);
    score = Math.max(5, Math.min(10, score));

    const suggestions = [
      skillCount < expectedSkillCount
        ? `建议补充${expectedSkillCount - skillCount}个左右技能`
        : null,
      !hasBackendSkills && !hasFrontendSkills
        ? "建议学习至少一个核心技术栈（后端或前端）"
        : null,
      hasDatabaseSkills ? null : "建议学习数据库相关技能",
      yearsOfExperience >= 3 && !hasDevOpsSkills
        ? "建议学习DevOps相关技能"
        : null,
      yearsOfExperience >= 5 && !hasCloudSkills
        ? "建议学习云平台相关技能"
        : null,
    ]
      .filter((s) => s !== null)
      .join("；");

    const suggestion = [feedback.trim() || "技能评估完成。", suggestions]
      .filter((s) => s)
      .join(" ");

    console.log("scoreSkills result => ", { score });
    return { score, suggestion };
  },
});
