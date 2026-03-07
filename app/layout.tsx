import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  metadataBase: new URL("https://boletalk.chat"),
  title: {
    default: "伯乐Talk - AI 智能面试官",
    template: "%s | 伯乐Talk",
  },
  description:
    "伯乐Talk 是多模态 AI 面试助手，支持文本、语音、实时电话、数字人视频四种面试模式，集成 RAG 知识库检索与个性化记忆系统，帮助你高效准备面试",
  keywords: [
    "伯乐Talk",
    "AI面试",
    "模拟面试",
    "智能面试官",
    "简历优化",
    "面试准备",
    "AI面试助手",
    "数字人面试",
    "语音面试",
    "面试评估",
  ],
  authors: [{ name: "伯乐Talk", url: "https://boletalk.chat" }],
  creator: "伯乐Talk",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://boletalk.chat",
    siteName: "伯乐Talk",
    title: "伯乐Talk - AI 智能面试官",
    description:
      "多模态 AI 面试助手，支持文本、语音、实时电话、数字人视频四种面试模式，集成 RAG 知识库与个性化记忆系统",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "伯乐Talk - AI 智能面试官",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "伯乐Talk - AI 智能面试官",
    description:
      "多模态 AI 面试助手，支持文本、语音、实时电话、数字人视频四种面试模式",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://boletalk.chat",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
  verification: {
    other: {
      "msvalidate.01": "B287BE39F49AE2E541D73C3C926E0AEF",
    },
  },
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

import { SpeechSynthesisProvider } from "@/components/speech-synthesis-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 获取当前运行环境，用于条件加载百度统计等生产环境专用脚本
  const nodeEnv = process.env.NODE_ENV || "development";
  return (
    <html
      className={`${geist.variable} ${geistMono.variable}`}
      // `next-themes` injects an extra classname to the body element to avoid
      // visual flicker before hydration. Hence the `suppressHydrationWarning`
      // prop is necessary to avoid the React hydration mismatch warning.
      // https://github.com/pacocoursey/next-themes?tab=readme-ov-file#with-app
      lang="zh-CN"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
        >
          <Toaster position="top-center" />
          <SessionProvider>
            <SpeechSynthesisProvider>{children}</SpeechSynthesisProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>

      {/* 百度统计：仅在生产环境下加载，用于收集网站访问数据（PV/UV等） */}
      {nodeEnv === "production" && (
        <Script
          dangerouslySetInnerHTML={{
            __html: `
              var _hmt = _hmt || [];
              (function() {
                var hm = document.createElement("script");
                hm.src = "https://hm.baidu.com/hm.js?5dc4ce157001caaeff5fca95cd745acb";
                var s = document.getElementsByTagName("script")[0];
                s.parentNode.insertBefore(hm, s);
              })();
            `,
          }}
          id="baidu-tongji-script"
        />
      )}
    </html>
  );
}
