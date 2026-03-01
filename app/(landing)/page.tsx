import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  ArrowRight,
  CheckCircle2,
  Code,
  FileText,
  Mail,
  MessageSquare,
  Sparkles,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { DemoSection } from "@/components/demo-section";
import { ScrollToTopLink } from "@/components/scroll-to-top-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const features = [
    {
      icon: FileText,
      color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40",
      title: "简历优化",
      description: "专业的简历分析和优化建议，帮你打造脱颖而出的简历",
    },
    {
      icon: MessageSquare,
      color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
      title: "模拟面试",
      description: "真实的面试场景模拟，提供即时反馈和改进建议",
    },
    {
      icon: Code,
      color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40",
      title: "面试题解答",
      description: "涵盖前端、算法、系统设计等各类编程面试题详解",
    },
  ];

  const highlights = [
    "专注程序员面试",
    "基于最新技术栈",
    "AI 智能分析",
    "即时反馈建议",
  ];

  return (
    <div className="min-h-screen bg-background">
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
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1 text-accent-foreground text-sm">
            <Sparkles className="size-4" />
            <span>由 AI 驱动的智能面试助手</span>
          </div>

          <h1 className="text-balance font-bold text-4xl tracking-tight md:text-6xl">
            你的专属
            <span className="text-blue-600"> AI Agent</span> 面试官
          </h1>

          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
            专注编程领域，尤其前端开发。提供简历优化、模拟面试、面试题解答等全方位面试辅导服务
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link href="/login">
              <Button
                className="w-full cursor-pointer bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                size="lg"
              >
                登录 / 注册
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href="/api/auth/guest?redirectUrl=/chat">
              <Button
                className="w-full cursor-pointer bg-transparent sm:w-auto"
                size="lg"
                variant="outline"
              >
                访客登录
                <UserPlus className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href="mailto:boletalk@example.com" target="_blank">
              <Button
                className="w-full cursor-pointer bg-transparent sm:w-auto"
                size="lg"
                variant="outline"
              >
                联系开发者
                <Mail className="ml-2 size-4" />
              </Button>
            </Link>
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
        </div>
      </section>

      {/* Features Section - 毛玻璃卡片 */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="text-balance font-bold text-3xl md:text-4xl">
            核心功能
          </h2>
          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
            全方位的面试准备解决方案
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
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
      </section>

      {/* Demo Section - GIF 展示区域 */}
      <section className="container mx-auto bg-muted/30 px-4 py-16 md:py-24">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="text-balance font-bold text-3xl md:text-4xl">
            功能演示
          </h2>
          <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
            看看 AI 面试官如何帮助你准备面试
          </p>
        </div>

        <DemoSection />
      </section>

      {/* CTA Section - 反转毛玻璃 */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="glass-card-inverted mx-auto max-w-4xl space-y-6 rounded-2xl p-8 text-center md:p-12">
          <h2 className="text-balance font-bold text-3xl md:text-4xl">
            准备好开始你的面试准备了吗？
          </h2>
          <p className="mx-auto max-w-2xl text-balance text-lg opacity-80">
            立即与 AI 面试官对话，获取专业的面试指导和建议
          </p>
          <div className="pt-4">
            <Link href="/api/auth/guest?redirectUrl=/chat">
              <Button
                className="w-full sm:w-auto"
                size="lg"
                variant="secondary"
              >
                开始对话
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
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
