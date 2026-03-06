import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Code,
  Cpu,
  Database,
  FileText,
  Globe,
  Link2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { DemoSection } from "@/components/demo-section";
import { LandingCtaButtons } from "@/components/landing-cta-buttons";
import { LogoTyping } from "@/components/logo-typing";
import { ModesSection } from "@/components/modes-section";
import { ScrollToTopLink } from "@/components/scroll-to-top-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const features = [
    {
      icon: FileText,
      color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40",
      title: "简历优化",
      description:
        "支持 PDF 上传解析，AI 智能分析简历结构与内容，提供细粒度的结构化优化建议",
    },
    {
      icon: MessageSquare,
      color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
      title: "模拟面试",
      description:
        "多 Agent 工作流自动意图分发，覆盖简历追问、行为面试、技术深挖等真实面试场景",
    },
    {
      icon: Code,
      color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40",
      title: "面试题解答",
      description:
        "结合 RAG 知识库检索与引用溯源，精准回答前端、算法、系统设计等面试题",
    },
    {
      icon: BarChart3,
      color: "text-amber-500 bg-amber-50 dark:bg-amber-950/40",
      title: "面试评估",
      description:
        "五维度结构化评分（技术/沟通/逻辑/项目/综合），三层智能缓存，评估结果持久化",
    },
    {
      icon: Brain,
      color: "text-rose-500 bg-rose-50 dark:bg-rose-950/40",
      title: "个性化记忆",
      description:
        "per-user Agent 记忆系统，跨会话记住你的优势和薄弱环节，实现个性化面试训练",
    },
    {
      icon: Link2,
      color: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950/40",
      title: "MCP 协议集成",
      description:
        "接入 GitHub/搜索/网页抓取等外部 MCP 工具，同时暴露核心 AI 能力供外部调用",
    },
  ];

  const highlights = [
    "四种交互模式",
    "RAG 知识库检索",
    "个性化 Agent 记忆",
    "MCP 协议集成",
    "多模型可切换",
    "面试评估持久化",
  ];

  const techStack = [
    {
      icon: Cpu,
      title: "AI SDK 多 Agent",
      description: "双层路由意图分发，共享工具层架构",
    },
    {
      icon: Database,
      title: "RAG 多阶段管线",
      description: "HyDE → 混合检索 → RRF → ReRank",
    },
    {
      icon: Sparkles,
      title: "多模型支持",
      description: "DeepSeek V3 / Qwen 3.5 Flash / GLM-4-Air",
    },
    {
      icon: Link2,
      title: "MCP 协议",
      description: "客户端接入 + 服务端暴露双向集成",
    },
    {
      icon: Brain,
      title: "Agent 记忆",
      description: "per-user RAG 读写，跨会话个性化记忆",
    },
    {
      icon: Globe,
      title: "Serverless 部署",
      description: "阿里云 FC + Neon Postgres + CF Workers",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "伯乐Talk",
    alternateName: "BoleTalk",
    url: "https://boletalk.chat",
    description:
      "多模态 AI 面试助手，支持文本、语音、实时电话、数字人视频四种面试模式，集成 RAG 知识库检索与个性化记忆系统",
    applicationCategory: "Education",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      {/* Header - 固定顶部 + 毛玻璃 */}
      <header className="glass-header fixed top-0 right-0 left-0 z-50">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ScrollToTopLink />
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild size="icon" variant="ghost">
              <a
                href="https://github.com/boat2moon/boletalk-agent"
                rel="noopener noreferrer"
                target="_blank"
              >
                <SiGithub className="size-5" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-14" />

      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-16 pb-8 md:pt-24 md:pb-12">
        <div className="mx-auto max-w-4xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1 text-accent-foreground text-sm">
            <Sparkles className="size-4" />
            <span>多模态 AI Agent · 四种交互模式</span>
          </div>

          <h1 className="text-balance font-bold text-4xl tracking-tight md:text-6xl">
            你的专属
            <span className="text-blue-600"> AI Agent</span> 面试官
          </h1>

          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
            支持文本、语音、实时电话、数字人视频四种面试模式，集成 RAG
            知识库检索与个性化记忆系统的全栈 AI 面试助手
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <LandingCtaButtons />
          </div>

          {/* Highlights */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-8 md:gap-6">
            {highlights.map((item) => (
              <div
                className="flex items-center gap-2 text-muted-foreground text-sm"
                key={item}
              >
                <CheckCircle2 className="size-4 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Large Logo + Typing */}
          <LogoTyping />
        </div>
      </section>

      {/* Features Section - 毛玻璃卡片 (灰底) */}
      <section className="bg-muted/30">
        <div className="container mx-auto px-4 pt-19 pb-16 md:pb-24">
          <div className="mb-12 space-y-4 text-center">
            <h2 className="text-balance font-bold text-3xl md:text-4xl">
              核心功能
            </h2>
            <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
              全方位的面试准备解决方案，从简历到面试到评估全链路覆盖
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  className="glass-card glass-card-interactive space-y-4 rounded-xl p-6"
                  key={feature.title}
                >
                  <div
                    className={`flex size-12 items-center justify-center rounded-lg ${feature.color}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-xl">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interaction Modes Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="text-balance font-bold text-3xl md:text-4xl">
            四种交互模式
          </h2>
          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
            从文本到语音到视频，选择最适合你的面试练习方式
          </p>
        </div>

        <ModesSection />
      </section>

      {/* Demo Section - GIF 展示区域 (灰底) */}
      <section className="bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="mb-12 space-y-4 text-center">
            <h2 className="text-balance font-bold text-3xl md:text-4xl">
              功能演示
            </h2>
            <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
              看看 AI 面试官如何帮助你准备面试
            </p>
          </div>

          <DemoSection />
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="text-balance font-bold text-3xl md:text-4xl">
            技术架构
          </h2>
          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
            基于 Vercel AI SDK 的「共享工具/MCP 层 + 子 Agent」分层架构
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {techStack.map((tech) => {
            const Icon = tech.icon;
            return (
              <div
                className="glass-card flex items-start gap-4 rounded-xl p-5"
                key={tech.title}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{tech.title}</h3>
                  <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                    {tech.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA Section - 反转毛玻璃 (灰底) */}
      <section className="bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="glass-card-inverted mx-auto max-w-4xl space-y-6 rounded-2xl p-8 text-center md:p-12">
            <h2 className="text-balance font-bold text-3xl md:text-4xl">
              准备好开始你的面试准备了吗？
            </h2>
            <p className="mx-auto max-w-2xl text-balance text-lg opacity-80">
              四种交互模式，从文本到语音到3D数字人——选择最适合你的方式，立即开始面试练习
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
              <LandingCtaButtons />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border border-t">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded bg-primary">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="text-muted-foreground text-sm">
                © {new Date().getFullYear()} 伯乐Talk
              </span>
            </div>
            <div className="text-muted-foreground text-sm">
              友情项目：
              <Link
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                href="https://rumuai.top"
                target="_blank"
              >
                入木AI（rumuai.top）
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
