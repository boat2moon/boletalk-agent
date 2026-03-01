"use client";

import { Code, FileText, MessageSquare } from "lucide-react";
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
  },
  {
    key: "interview",
    icon: MessageSquare,
    label: "模拟面试场景",
    description: "真实面试对话，实时反馈和评分",
    image: "/images/2-mock-interview.gif",
  },
  {
    key: "qa",
    icon: Code,
    label: "面试题详解",
    description: "前端经典面试题目，详细解答和思路分析",
    image: "/images/3-q-a.gif",
  },
];

export function DemoSection() {
  const [active, setActive] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // 同步 Carousel 滑动 → Tab 指示器
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

  // Tab 指示器位置计算
  const updateIndicator = useCallback(() => {
    const btn = buttonRefs.current[active];
    const container = containerRef.current;
    if (btn && container) {
      setIndicator({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
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
      {/* Tab 导航栏 - 整体毛玻璃容器 + 滑动指示器 */}
      <div className="glass-card mx-auto w-fit rounded-full p-2">
        <div
          className="relative flex flex-wrap justify-center gap-1 sm:gap-2"
          ref={containerRef}
        >
          {/* 滑动背景指示器 */}
          <div
            className="absolute top-0 h-full rounded-full bg-foreground shadow-lg"
            style={{
              left: indicator.left,
              width: indicator.width,
              transition:
                "left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          {demos.map((demo, i) => (
            <button
              className={`relative z-1 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 font-medium text-sm transition-colors duration-300 ${
                active === i
                  ? "text-background"
                  : "hover:bg-white/30 dark:hover:bg-white/10"
              }
              `}
              key={demo.key}
              onClick={() => scrollTo(i)}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
            >
              <demo.icon className="h-4 w-4" />
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
                  {/* biome-ignore lint/nursery/useImageSize: GIF carousel images */}
                  {/* biome-ignore lint/performance/noImgElement: GIF needs raw img */}
                  <img
                    alt={demo.label}
                    className="w-full rounded-xl"
                    src={demo.image}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
