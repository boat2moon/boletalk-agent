/**
 * 职位 JD 模板
 *
 * 提供面试场景下的职位描述模板。
 * 用户选择模板后，JD 内容注入面试 prompt，使 AI 面试官的提问更有针对性。
 *
 * 两种使用方式：
 * 1. 选择预设模板 → buildJobContext(templateId)
 * 2. 自定义 JD 文本 → buildJobContext(undefined, customText)
 */

// ==================== 模板定义 ====================

export type JobTemplate = {
  id: string;
  label: string;
  icon: string;
  /** 简短描述（在 UI 中展示） */
  brief: string;
  /** 完整 JD 描述（注入 prompt） */
  description: string;
};

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: "frontend",
    label: "前端工程师",
    icon: "💻",
    brief: "React/Vue、性能优化、工程化",
    description: `岗位：前端工程师
技术栈要求：
- 精通 HTML5/CSS3/JavaScript/TypeScript
- 熟练使用 React 或 Vue 框架，了解其核心原理（虚拟 DOM、响应式、Fiber 等）
- 熟悉前端工程化（Webpack/Vite、CI/CD、代码规范）
- 有性能优化经验（首屏加载、渲染优化、缓存策略）
- 了解浏览器原理、网络协议（HTTP/HTTPS、WebSocket）
- 有跨端开发经验（小程序、React Native、Electron）为加分项
考察重点：JS 基础（闭包、原型链、事件循环）、框架原理、性能优化、组件设计、工程化实践`,
  },
  {
    id: "backend",
    label: "后端工程师",
    icon: "🖥️",
    brief: "Java/Go/Python、数据库、分布式",
    description: `岗位：后端工程师
技术栈要求：
- 精通 Java/Go/Python 中至少一门语言
- 熟悉 Spring Boot / Gin / FastAPI 等主流框架
- 熟练掌握 MySQL、Redis，了解数据库优化和索引设计
- 有分布式系统经验（微服务、消息队列、RPC）
- 了解容器化和云原生（Docker、K8s）
- 熟悉 Linux 操作和基本运维
考察重点：数据结构与算法、系统设计、数据库优化、并发编程、接口设计`,
  },
  {
    id: "fullstack",
    label: "全栈工程师",
    icon: "🔗",
    brief: "前后端通吃、独立交付能力",
    description: `岗位：全栈工程师
技术栈要求：
- 前端：熟练使用 React/Vue + TypeScript，了解 Next.js/Nuxt.js 等 SSR 框架
- 后端：熟悉 Node.js/Python/Go，能独立设计 RESTful API
- 数据库：MySQL/PostgreSQL + Redis，了解 ORM 和数据建模
- DevOps：熟悉 Git 工作流、CI/CD、Docker 部署
- 有独立负责从 0 到 1 项目经验为加分项
考察重点：全链路思维、技术选型能力、前后端接口设计、项目架构、快速学习能力`,
  },
  {
    id: "algorithm",
    label: "算法工程师",
    icon: "🧮",
    brief: "机器学习、深度学习、数据挖掘",
    description: `岗位：算法工程师
技术栈要求：
- 扎实的数学基础（线性代数、概率论、最优化）
- 精通机器学习经典算法（SVM、决策树、集成学习等）
- 熟悉深度学习框架（PyTorch/TensorFlow），有 NLP/CV/推荐系统方向经验
- 熟练使用 Python 及数据分析工具（Numpy、Pandas、Scikit-learn）
- 有模型部署和工程化经验（ONNX、TensorRT、模型压缩）
- 了解大模型（LLM）微调和推理优化为加分项
考察重点：算法原理、数学推导、模型设计思路、实验方法论、工程落地能力`,
  },
];

// ==================== 构建函数 ====================

/**
 * 根据模板 ID 或自定义文本构建 jobContext prompt 片段
 *
 * @param templateId - 预设模板 ID（如 "frontend"）
 * @param customJD - 自定义 JD 文本（templateId 为 "custom" 时使用）
 * @returns 格式化的 prompt 片段，或 undefined（未选择时）
 */
export function buildJobContext(
  templateId?: string,
  customJD?: string
): string | undefined {
  if (!templateId) {
    return;
  }

  // 处理 "custom:xxx" 格式（纯文本/基础语音模式通过 prepareSendMessagesRequest 传入）
  if (templateId.startsWith("custom:")) {
    const text = templateId.slice(7).trim();
    if (!text) {
      return;
    }
    return `[目标职位信息]\n以下是本次面试的目标职位描述，请围绕这些要求来设计面试问题：\n\n${text}`;
  }

  // 处理 templateId="custom" + 独立 customJD 参数（电话/视频面试模式）
  if (templateId === "custom" && customJD?.trim()) {
    return `[目标职位信息]\n以下是本次面试的目标职位描述，请围绕这些要求来设计面试问题：\n\n${customJD.trim()}`;
  }

  const template = JOB_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return;
  }

  return `[目标职位信息]\n以下是本次面试的目标职位描述，请围绕这些要求来设计面试问题：\n\n${template.description}`;
}
