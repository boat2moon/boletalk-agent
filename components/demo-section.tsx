"use client";

import {
  BarChart3,
  Code,
  Database,
  FileText,
  MessageSquare,
  Mic,
  Phone,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

// GIF 使用原生 img 直接预加载，不做懒加载

const demos = [
  {
    key: "resume",
    icon: FileText,
    label: "简历智能分析",
    description: "上传简历，AI 自动分析并提供优化建议",
    image: "/images/1-resume-opt.gif",
    isPlaceholder: false,
  },
  {
    key: "interview",
    icon: MessageSquare,
    label: "模拟面试场景",
    description: "真实面试对话，实时反馈和评分",
    image: "/images/2-mock-interview.gif",
    isPlaceholder: false,
  },
  {
    key: "qa",
    icon: Code,
    label: "面试题详解",
    description: "前端经典面试题目，详细解答和思路分析",
    image: "/images/3-q-a.gif",
    isPlaceholder: false,
  },
  {
    key: "evaluation",
    icon: BarChart3,
    label: "面试评估报告",
    description: "五维度结构化评分 + 详细反馈，评估结果持久化",
    image: "",
    isPlaceholder: true,
  },
  {
    key: "rag",
    icon: Database,
    label: "RAG 知识库引用",
    description: "RAG 检索知识库，引用溯源展示参考文档",
    image: "",
    isPlaceholder: true,
  },
  {
    key: "voice",
    icon: Mic,
    label: "语音面试模式",
    description: "双向流式 TTS + 实时 ASR，语音对话面试",
    image: "",
    isPlaceholder: true,
  },
  {
    key: "phone",
    icon: Phone,
    label: "实时电话面试",
    description: "豆包端到端语音大模型，真实通话体验",
    image: "",
    isPlaceholder: true,
  },
  {
    key: "avatar",
    icon: Video,
    label: "3D 数字人面试",
    description: "阿里云 3D 数字人 + VAD 免按钮视频面试",
    image: "",
    isPlaceholder: true,
  },
];

export function DemoSection() {
  const [active, setActive] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const gridRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  // 同步 Carousel 滑动 → Tab
  const onCarouselSelect = useCallback(() => {
    if (!carouselApi) {
      return;
    }
    setActive(carouselApi.selectedScrollSnap());
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) {
      return;
    }
    onCarouselSelect();
    carouselApi.on("select", onCarouselSelect);
    return () => {
      carouselApi.off("select", onCarouselSelect);
    };
  }, [carouselApi, onCarouselSelect]);

  // 滑块位置计算
  const updateIndicator = useCallback(() => {
    const btn = buttonRefs.current[active];
    const grid = gridRef.current;
    if (btn && grid) {
      setIndicator({
        top: btn.offsetTop,
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        height: btn.offsetHeight,
      });
    }
  }, [active]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  // 点击 Tab → 滑动 Carousel
  const scrollTo = useCallback(
    (index: number) => {
      setActive(index);
      carouselApi?.scrollTo(index);
    },
    [carouselApi]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Tab 导航栏 - 两行四列 + 自由滑动指示器 */}
      <div className="glass-card mx-auto max-w-2xl rounded-2xl p-2">
        <div className="relative grid grid-cols-4 gap-1" ref={gridRef}>
          {/* 自由滑动背景指示器 */}
          <div
            className="pointer-events-none absolute rounded-xl bg-foreground shadow-lg"
            style={{
              top: indicator.top,
              left: indicator.left,
              width: indicator.width,
              height: indicator.height,
              transition:
                "top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          {demos.map((demo, i) => (
            <button
              className={`relative z-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-medium text-xs transition-colors duration-300 ${
                active === i
                  ? "text-background"
                  : "hover:bg-white/30 dark:hover:bg-white/10"
              }`}
              key={demo.key}
              onClick={() => scrollTo(i)}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
            >
              <demo.icon className="size-3.5 shrink-0" />
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      {/* GIF 轮播区域 - 毛玻璃边框 + 左右滑动 */}
      <div className="glass-card overflow-hidden rounded-2xl p-2 sm:p-3">
        <Carousel
          className="w-full"
          opts={{
            align: "start",
          }}
          setApi={setCarouselApi}
        >
          <CarouselContent>
            {demos.map((demo) => (
              <CarouselItem key={demo.key}>
                <div className="overflow-hidden rounded-xl bg-muted">
                  {demo.isPlaceholder ? (
                    <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-border border-dashed bg-muted/50">
                      <demo.icon className="mb-3 size-16 text-muted-foreground/30" />
                      <span className="font-medium text-muted-foreground text-sm">
                        {demo.label}
                      </span>
                      <span className="mt-1 text-muted-foreground/60 text-xs">
                        {demo.description}
                      </span>
                      <span className="mt-2 text-muted-foreground/40 text-xs">
                        [ 演示截图 / GIF 占位 ]
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* biome-ignore lint/nursery/useImageSize: GIF carousel images */}
                      {/* biome-ignore lint/performance/noImgElement: GIF needs raw img */}
                      <img
                        alt={demo.label}
                        className="w-full rounded-xl"
                        src={demo.image}
                      />
                    </>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
