import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  FileText,
  MessageSquare,
  Code,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  UserPlus,
  Mail,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { DemoSection } from "@/components/demo-section";
import { ScrollToTopLink } from "@/components/scroll-to-top-link";
import { SiGithub } from "@icons-pack/react-simple-icons";

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
      <header className="glass-header fixed top-0 left-0 right-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollToTopLink />
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/boat2moon/boletalk-agent"
                target="_blank"
                rel="noopener noreferrer"
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
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm border border-border">
            <Sparkles className="size-4" />
            <span>由 AI 驱动的智能面试助手</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance">
            你的专属
            <span className="text-blue-600"> AI Agent</span> 面试官
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
            专注编程领域，尤其前端开发。提供简历优化、模拟面试、面试题解答等全方位面试辅导服务
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/login">
              <Button
                size="lg"
                className="w-full sm:w-auto cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
              >
                登录 / 注册
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href="/api/auth/guest?redirectUrl=/chat">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto bg-transparent cursor-pointer"
              >
                访客登录
                <UserPlus className="ml-2 size-4" />
              </Button>
            </Link>
            <Link
              href="mailto:boletalk@example.com"
              target="_blank"
            >
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto bg-transparent cursor-pointer"
              >
                联系开发者
                <Mail className="ml-2 size-4" />
              </Button>
            </Link>
          </div>

          {/* Highlights */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 pt-8">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-sm text-muted-foreground"
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
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-balance">
            核心功能
          </h2>
          <p className="text-lg text-muted-foreground text-balance max-w-2xl mx-auto">
            全方位的面试准备解决方案
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="glass-card glass-card-interactive p-6 rounded-xl space-y-4"
              >
                <div
                  className={`size-12 rounded-lg flex items-center justify-center ${feature.color}`}
                >
                  <Icon className="size-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
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
      <section className="container mx-auto px-4 py-16 md:py-24 bg-muted/30">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-balance">
            功能演示
          </h2>
          <p className="text-lg text-muted-foreground text-balance max-w-2xl mx-auto">
            看看 AI 面试官如何帮助你准备面试
          </p>
        </div>

        <DemoSection />
      </section>

      {/* CTA Section - 反转毛玻璃 */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="glass-card-inverted max-w-4xl mx-auto p-8 md:p-12 text-center space-y-6 rounded-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-balance">
            准备好开始你的面试准备了吗？
          </h2>
          <p className="text-lg opacity-80 text-balance max-w-2xl mx-auto">
            立即与 AI 面试官对话，获取专业的面试指导和建议
          </p>
          <div className="pt-4">
            <Link href="/api/auth/guest?redirectUrl=/chat">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                开始对话
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded bg-primary flex items-center justify-center">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} 伯乐Talk
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              友情项目：
              <Link
                href="https://rumuai.top"
                target="_blank"
                className="hover:text-foreground transition-colors underline underline-offset-4"
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
