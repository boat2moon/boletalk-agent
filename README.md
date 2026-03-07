<div align="center">
  <h1>🎯 伯乐Talk Agent</h1>
  <p><strong>面向程序员求职场景的 AI 面试辅助智能体</strong></p>
  <p>
    基于 Vercel AI SDK 的「共享工具/MCP 层 + 子 Agent」架构，支持 Text / Voice / Phone / Avatar 四种交互模式。<br/>
    包含 MCP 双向集成、RAG 知识库检索、Agent 记忆系统、面试评估持久化与 JD 模板注入。
  </p>
</div>

---

## ✨ 项目简介

伯乐Talk 是一个**全栈 AI Agent 产品**，帮助程序员完成简历优化、模拟面试、面试题解答和结构化面试评估。它不是简单的问答 ChatBot，而是一个具备意图分类、多 Agent 分发、Tool Calling、RAG 知识库检索和跨会话记忆的完整 Agent 系统。

用户可以上传 PDF 简历、选择目标岗位 JD 模板，Agent 会围绕岗位要求进行模拟面试，结束后生成五维度评分的结构化评估报告。

### 四种面试模式

| 模式 | 描述 |
|:---|:---|
| **💬 Text** | 纯文本对话，SSE 流式输出，支持 Markdown 渲染 |
| **🎙️ Voice** | 文本基础上增加双向流式 TTS（豆包/CosyVoice WebSocket）+ 前端阿里云 NLS 流式 ASR |
| **📞 Phone** | 豆包端到端实时语音大模型，通过 Cloudflare Durable Object 双 WebSocket 桥接代理 |
| **🎥 Avatar** | 阿里云 3D 数字人视频面试，浏览器端 Silero VAD + 流式 ASR 自研语音 Pipeline |

---

## 🏗️ 技术架构

### 技术栈一览

| 层级 | 技术 |
|:---|:---|
| 前端框架 | Next.js 16 (App Router) + React |
| AI SDK | Vercel AI SDK (`@ai-sdk/react`, `ai`) |
| AI 模型 | DeepSeek V3（默认对话 + 内部管线）/ Qwen 3.5 Flash / GLM-4-Air |
| 数据库 | Neon PostgreSQL + Drizzle ORM + pgvector |
| 认证 | NextAuth.js（邮箱登录 + 游客模式）|
| 向量检索 | 智谱 Embedding-3 (1024维) + HNSW/GIN 索引 |
| MCP 客户端 | GitHub MCP (stdio) / Tavily MCP (HTTP) / Fetch MCP (stdio) |
| MCP 服务端 | Bole-MCP Server (Streamable HTTP Transport) |
| 部署 | 阿里云 Serverless FC + Cloudflare Workers (Phone 模式) |
| 监控 | cron-job.org + 自建心跳 API |

---

## 📐 整体架构图

### 图1：分层架构总览（共享工具/MCP 层 + 子 Agent）

```mermaid
flowchart TB
    subgraph Entry["🌐 交互模式入口"]
        E1["Text /api/chat"]
        E2["Voice /api/chat"]
        E3["Phone /api/realtime/session"]
        E4["Avatar /api/avatar/send"]
    end

    subgraph Prompt["📝 Prompt 工程（输入准备）"]
        PM["系统 Prompt<br/>systemPrompt() / prompts.ts"]
        PB["prompt-builder<br/>buildInterviewPrompt()"]
        JT["job-templates<br/>buildJobContext()"]
    end

    subgraph Agents["🤖 子 Agent 层"]
        A1["主 Agent<br/>classify → 分发<br/>(含 evaluate 分支)"]
        A2["豆包端到端实时语音模型<br/>前端 WebSocket 直连"]
        A3["Avatar Agent<br/>generateText → SendText"]
    end

    subgraph Toolkit["🔧 共享工具层 lib/ai/toolkit/"]
        RA["resume-analyzer"]
        UG["usage"]
        RG["rag (公域检索)"]
        MR["memory/searchMemory<br/>(memoryRead Tool)"]
        MW["memory/writeChatMemory<br/>🗄️ → MemoryChunk 表<br/>(程序化 fire-and-forget)"]
    end

    subgraph MCPClient["🔌 MCP 客户端层 lib/ai/mcp/ + lib/ai/tools/"]
        MC1["githubAnalysisTool<br/>GitHub MCP (stdio)"]
        MC2["webSearchTool<br/>Tavily MCP (HTTP)"]
        MC3["fetchUrlTool<br/>Fetch MCP (stdio)"]
    end

    subgraph MCPServer["🌐 Bole-MCP Server /api/mcp"]
        MS1["bole/resume-analyze"]
        MS2["bole/interview-evaluate"]
        MS3["bole/rag-search"]
    end

    E1 & E2 --> A1
    E3 --> A2
    E4 --> A3

    PM -.-> A1
    PB -.-> A2 & A3
    JT -.-> PM & PB

    A1 <-.-> UG & RG & MR
    A1 <-.-> MC1 & MC2 & MC3
    A2 <-.-> RA
    A3 <-.-> RA

    RA -.-> MS1
    RG -.-> MS3

    A1 --> O1["流式文本 / TTS音频 / 📊评估结果"]
    A1 -.->|"评估后"| MW
    E3 -.->|"挂断评估后"| MW
    E4 -.->|"挂断评估后"| MW
    A2 --> O2["豆包实时语音"]
    A3 --> O3["数字人播报"]
```

---

### 图2：主 Agent 内部流水线（Text / Voice）

```mermaid
flowchart TD
    A["👤 用户消息"] --> B["createChatStream()"]
    B --> C["classifyMessages()<br/>双层路由"]

    C -->|"intent='evaluate'<br/>(确定性)"| EV["📊 evaluate.ts<br/>generateEvaluation()"]
    C -->|"LLM 分类<br/>resume_opt"| D["📝 resume-opt.ts"]
    C -->|mock_interview| E["🎤 mock-interview.ts"]
    C -->|related / others| F["💬 common.ts"]

    EV --> EV2["解析 JSON → saveEvaluation()"]
    EV2 --> EV3["📤 evaluation annotation"]
    EV2 -.->|"fire-and-forget"| MEM["🧠 writeChatMemory()\n会话文本 + 评估摘要\n→ MemoryChunk 表"]

    D --> G["🧠 用户选择的模型<br/>DeepSeek V3 / Qwen / GLM"]
    E --> G
    F --> G

    D -.- T1["🔧 getResumeTemplate"]
    E -.- T2["🔧 getBehaviouralQuestions"]
    E -.- T3["🔍 ragSearch"]
    E -.- T4["🧠 memoryRead"]
    E -.- T5["🔌 githubAnalysis"]
    E -.- T6["🔌 webSearch"]
    E -.- T7["🔌 fetchUrl"]
    F -.- T3
    F -.- T4
    F -.- T5
    F -.- T6
    F -.- T7

    G --> JC{"jobContext?"}
    JC -->|注入| G2["systemPrompt + jobContext"]
    JC -->|无| G3["systemPrompt"]
    G2 & G3 --> H{"voiceMode?"}
    H -->|否| I["📤 流式文本"]
    H -->|是| J["buildVoiceConstraint()"]
    J --> K["🔊 TTS 三级降级"]
    K --> L["📤 文本 + 音频"]
```

---

### 图3：Phone 模式流程（Prompt 配置 + 端到端实时语音）

```mermaid
flowchart TD
    A["📞 用户进入 Phone 模式"] --> B["/api/realtime/session"]
    B --> JD{"选择了 JD?"}
    JD -->|是| JD2["buildJobContext()<br/>→ jobContext"]
    JD -->|否| JD3["jobContext = undefined"]
    JD2 & JD3 --> C{"上传了简历?"}

    C -->|是| D["toolkit/resume-analyzer<br/>analyzeResume()"]
    D --> E["buildRealtimePromptFromAnalysis()"]
    E --> F["buildInterviewPrompt<br/>mode='phone'<br/>resumeContext + jobContext"]

    C -->|否| G["buildInterviewPrompt<br/>mode='phone', jobContext"]

    F --> H["注入 systemInstruction"]
    G --> H

    H --> I["创建豆包 Realtime 会话<br/>返回 session token"]
    I --> J["🎙️ 前端 WebSocket 直连<br/>端到端实时语音"]
    J -->|面试结束| K["POST /api/chat/evaluation<br/>生成评估 → DB"]
    K -.->|"fire-and-forget"| MEM["🧠 writeChatMemory()\n→ MemoryChunk 表"]
```

---

### 图4：Avatar Agent 流程

```mermaid
flowchart TD
    A0["🎥 用户进入 Avatar 模式"] --> A1["/api/avatar/start"]
    A1 --> JD{"选择了 JD?"}
    JD -->|是| JD2["buildJobContext()<br/>返回 jobContext 给前端"]
    JD -->|否| JD3["jobContext = undefined"]

    JD2 & JD3 --> A["用户发送文本"]
    A --> B["/api/avatar/send<br/>(携带 jobContext)"]
    B --> C["avatar-agent.ts<br/>createAvatarResponse()"]

    C --> D["buildInterviewPrompt<br/>mode='avatar'<br/>resumeContext + jobContext"]
    D --> E["组装对话历史<br/>system + history + user"]
    E --> F["🧠 Qwen 3.5 Flash<br/>generateText()"]
    F --> G["逐句拆分回复<br/>splitBySentence()"]
    G --> H["遍历句子"]
    H --> I["sendAvatarText()<br/>阿里云数字人 SendText API"]
    I --> J{"还有下一句?"}
    J -->|是| H
    J -->|否| K["返回完整回复文本"]
    K -->|面试结束| L["POST /api/chat/evaluation<br/>生成评估 → DB"]
    L -.->|"fire-and-forget"| MEM["🧠 writeChatMemory()\n→ MemoryChunk 表"]
```

---

### 图5：共享工具层 + Prompt 工程层详情

```mermaid
flowchart TB
    subgraph PromptEng["📝 Prompt 工程层"]
        subgraph PB["🔧 prompt-builder"]
            direction TB
            PB1["常量片段"]
            PB2["BASE_INTERVIEWER_ROLE<br/>INTERVIEW_FLOW<br/>VOICE_CONSTRAINTS"]
            PB3["构建函数"]
            PB4["buildInterviewPrompt(mode, resumeContext?, jobContext?)<br/>buildVoiceConstraint()"]
            PB1 --- PB2
            PB3 --- PB4
        end

        subgraph JT["📋 job-templates"]
            direction TB
            JT1["JOB_TEMPLATES[]<br/>前端/后端/全栈/算法"]
            JT2["buildJobContext(templateId?, customJD?)"]
            JT1 --> JT2
            JT2 --> JT3["→ 岗位 Prompt 片段<br/>注入 systemPrompt 末尾"]
        end
    end

    subgraph SharedToolkit["🔧 共享工具层"]
        subgraph RA["🔧 resume-analyzer"]
            direction TB
            RA1["analyzeResume(text)"]
            RA1 --> RA2["DeepSeek generateObject()<br/>→ ResumeAnalysis"]
            RA2 --> RA3["buildRealtimePromptFromAnalysis()<br/>→ Prompt 片段"]
        end

        subgraph UG["🔧 usage"]
            direction TB
            UG1["createUsageFinishHandler()"]
            UG1 --> UG2["TokenLens 获取模型目录"]
            UG2 --> UG3["计算 token 费用"]
            UG3 --> UG4["写入 dataStream<br/>推送到前端"]
        end

        subgraph RG["🔍 rag"]
            direction TB
            RG1["ragSearch Tool"]
            RG1 --> RG2["searchKnowledge()"]
            RG2 --> RG3["HyDE(DeepSeek) → 混合检索<br/>→ RRF → 去重 → ReRank(gte-rerank-v2)"]
        end

        subgraph MEM["🧠 memory"]
            direction TB
            MEM1["memoryRead Tool<br/>createMemoryReadTool(userId)"]
            MEM1 --> MEM2["searchMemory()"]
            MEM2 --> MEM3["混合检索 + RRF<br/>+ 相似度阈值 + 去重"]
            MEM4["writeChatMemory()"]
            MEM4 --> MEM5["切分 → 向量化<br/>→ 先删后插"]
        end
    end

    subgraph MCPLayer["🔌 MCP 层"]
        subgraph MCPCli["🔌 MCP 客户端 (lib/ai/mcp/ + tools/)"]
            direction TB
            MCC["mcp-clients.ts<br/>单例管理 3 个 MCP Client"]
            MCC --> MCT1["githubAnalysisTool<br/>GitHub MCP (stdio)<br/>MCP数据拉取 + DeepSeek分析"]
            MCC --> MCT2["webSearchTool<br/>Tavily MCP (HTTP)<br/>远程搜索"]
            MCC --> MCT3["fetchUrlTool<br/>Fetch MCP (stdio)<br/>网页拓取"]
        end

        subgraph MCPSvr["🌐 Bole-MCP Server (lib/mcp/)"]
            direction TB
            MSS["McpServer 'Bole-MCP'<br/>Streamable HTTP /api/mcp"]
            MSS --> MST1["bole/resume-analyze<br/>复用 analyzeResume()"]
            MSS --> MST2["bole/interview-evaluate<br/>复用 generateEvaluation()"]
            MSS --> MST3["bole/rag-search<br/>复用 searchKnowledge()"]
        end
    end
```

---

### 图6：四模式 Prompt 构建差异

```mermaid
flowchart TB
    subgraph TP["1️⃣ Text"]
        direction LR
        T1["regularPrompt"]
        T2["+ artifactsPrompt"]
        T3["+ jobContext (可选)"]
        T1 --> T2 --> T3
    end

    subgraph VP["2️⃣ Voice"]
        direction LR
        V1["regularPrompt"]
        V2["+ buildVoiceConstraint()"]
        V3["+ jobContext (可选)"]
        V1 --> V2 --> V3
    end

    subgraph PP["3️⃣ Phone"]
        direction LR
        P1["buildInterviewPrompt('phone')"]
        P2["+ resumeContext (可选)"]
        P3["+ jobContext (可选)"]
        P1 --> P2 --> P3
    end

    subgraph AP["4️⃣ Avatar"]
        direction LR
        A1["buildInterviewPrompt('avatar')"]
        A2["+ AVATAR_CONSTRAINTS"]
        A3["+ resumeContext (可选)"]
        A4["+ jobContext (可选)"]
        A1 --> A2 --> A3 --> A4
    end

    TP ~~~ VP ~~~ PP ~~~ AP
```

---

## 📊 四种模式详细对比

| | **Text** | **Voice** | **Phone** | **Avatar** |
|:---|:---|:---|:---|:---|
| **入口** | `/api/chat` | `/api/chat` | `/api/realtime/session` | `/api/avatar/send` |
| **子 Agent** | 主 Agent (classify→分发) | 主 Agent (classify→分发) | 豆包端到端实时语音模型 | avatar-agent.ts |
| **模型** | 用户选择 (DS/Qwen/GLM) | 用户选择 (DS/Qwen/GLM) | 豆包端到端 | Qwen 3.5 Flash |
| **Prompt 构建** | `systemPrompt()` | 同左 + `buildVoiceConstraint()` | `buildInterviewPrompt('phone')` | `buildInterviewPrompt('avatar')` |
| **JD 模板** | ✅ 紧凑下拉 | ✅ 紧凑下拉 | ✅ 完整卡片 | ✅ 完整卡片 |
| **面试评估** | ✅ Agent 意图分发 | ✅ Agent 意图分发 | ✅ 独立 API | ✅ 独立 API |
| **resume-analyzer** | ❌ | ❌ | ✅ 可选 | ✅ 可选 |
| **usage** | ✅ | ✅ | ❌ | ❌ |
| **共享工具** | ragSearch, memoryRead | 同左 | 无 | 无 |
| **MCP 工具** | githubAnalysis, webSearch, fetchUrl | 同左 | 无 | 无 |
| **记忆读取** | ✅ LLM 自主调用 | ✅ LLM 自主调用 | ❌ | ❌ |
| **记忆写入** | ✅ 评估后 fire-and-forget | ✅ 评估后 fire-and-forget | ✅ 评估后 fire-and-forget | ✅ 评估后 fire-and-forget |
| **输出** | 流式文本 | 文本+TTS音频 | 实时语音 | 数字人播报 |

---

## 🔑 核心特性

### Agent 工作流

- **双层路由意图分类**：第一层确定性路由（前端按钮带 `intent` 参数直接跳过 LLM 分发），第二层 LLM 概率性分类（`generateObject` + Zod Schema 约束输出）
- **多 Agent 分发**：简历优化 / 模拟面试 / 面试评估 / 通用问答，各自有独立的 System Prompt 和 Tools
- **共享工具层**：`resume-analyzer`、`usage`、`rag`、`memory` 等模块一处实现多处复用

### RAG 知识库检索

- **多阶段管线**：HyDE（假设文档嵌入）→ 向量/全文混合检索 → RRF 融合排序 → 文本去重 → DashScope gte-rerank-v2 专用模型 ReRank
- **Markdown-aware 文档切分**：代码块保护 + 标题栈层级追踪 + 引用溯源

### Agent 记忆系统（per-user RAG）

- 面试评估完成后 fire-and-forget 异步写入会话文本和评估摘要
- per-user 数据隔离（`userId` 索引），轻量混合检索（无 HyDE/ReRank，低延迟优先）
- 工厂函数模式闭包绑定 `userId`，LLM 自主决定何时读取

### 面试评估三层缓存

```
第一层：React state（evaluationData）
  ↓ state 为空
第二层：GET /api/chat/evaluation → DB 查询
  ↓ DB 无记录
第三层：POST /api/chat/evaluation → generateEvaluation → DB 写入
```

| 模式 | 触发方式 | 缓存特点 |
|:---|:---|:---|
| Text / Voice | 「总结评价」按钮 → Agent intent 分发 | 发新消息清空缓存 |
| Phone / Avatar | 面试结束 → POST /api/chat/evaluation | 不重开不重生成 |

### MCP 协议双向集成

- **客户端**：接入 GitHub / Tavily / Fetch 三个外部 MCP Server，拓展 Agent 信息获取能力
- **服务端**：`Bole-MCP Server` 将简历分析、面试评估、RAG 检索三大能力通过 MCP 协议暴露给外部 AI 客户端

### 语音能力

- **Voice 模式**：双向流式 TTS（豆包 TTS 2.0 / CosyVoice WebSocket）+ 前端阿里云 NLS 流式 ASR + MSE 无缝播放 + 逐句 TTS 级联降级
- **Phone 模式**：Cloudflare Durable Object 双 WebSocket 桥接代理 + 手写豆包二进制帧协议编解码 + AudioContext 时间轴队列式播放
- **Avatar 模式**：浏览器端 Silero VAD ONNX 推理 + 音频预缓冲机制 + 打断式半双工 + 逐句 SendText 延迟优化

### 其他

- **PDF 简历解析**：前端 base64 编码 + 服务端 `pdf-parse` 文本提取 → Prompt 注入
- **JD 模板注入**：`buildJobContext()` 构建岗位 Prompt 片段，注入 System Prompt 末尾
- **API 速率限制**：游客 10 次/天、注册用户 30 次/天，前端 SVG 圆环进度条实时展示
- **部署**：阿里云 Serverless FC（标准 Node.js 运行时） + Cloudflare Workers（Phone 模式）+ Neon PostgreSQL + 域名 SSL + 心跳监控

---

## 🚀 本地运行

1. 安装依赖：

```bash
pnpm install
```

2. 配置环境变量（参考 `.env.example`）：

```bash
cp .env.example .env.local
# 编辑 .env.local 填写必要的 API Key
```

3. 初始化数据库：

```bash
pnpm db:migrate
```

4. 启动开发服务器：

```bash
pnpm dev
```

应用将运行在 [localhost:3000](http://localhost:3000)。

---

## 📁 项目结构

```
boletalk-agent/
├── app/                    # Next.js App Router 页面与 API Routes
│   ├── (chat)/             # 聊天页面
│   └── api/                # API 端点 (chat, tts, stt, avatar, realtime, mcp, monitor...)
├── lib/
│   ├── ai/
│   │   ├── agents/         # 子 Agent 层 (主 Agent 分发, Avatar Agent)
│   │   ├── toolkit/        # 共享工具层 (prompt-builder, resume-analyzer, usage, rag, memory)
│   │   ├── mcp/            # MCP 客户端 (GitHub, Tavily, Fetch)
│   │   └── tools/          # AI SDK Tool 封装
│   ├── mcp/                # MCP 服务端 (Bole-MCP Server)
│   └── db/                 # Drizzle ORM Schema 与数据库操作
├── components/             # React 组件
├── hooks/                  # 自定义 Hooks (STT, TTS, VAD...)
├── RAG-DOC/                # RAG 知识库文档
└── scripts/                # 索引构建脚本
```
