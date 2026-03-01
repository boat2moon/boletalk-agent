"use client";

import { useEffect, useRef, useState } from "react";

type DemoImageProps = {
  src: string;
  alt: string;
};

export function DemoImage({ src, alt }: DemoImageProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) {
      return;
    }

    // 使用 Intersection Observer 来精确控制图片加载
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // 只有当图片真正进入视口时才加载
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        // 设置 rootMargin 为 0，确保只有进入视口才加载
        rootMargin: "0px",
        threshold: 0.01,
      }
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    // biome-ignore lint/nursery/useImageSize: GIF images need raw img for animation
    // biome-ignore lint/performance/noImgElement: using raw img for lazy loading control
    <img
      alt={alt}
      className="h-auto w-full"
      decoding="async"
      ref={imgRef}
      src={shouldLoad ? src || "/placeholder.svg" : undefined}
    />
  );
}
