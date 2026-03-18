"use client";

import { useCallback, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type ImageWithSkeletonProps = {
  src: string;
  alt: string;
  className?: string;
  skeletonClassName?: string;
};

export function ImageWithSkeleton({
  src,
  alt,
  className = "",
  skeletonClassName = "",
}: ImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);

  // ref callback：处理图片已在浏览器缓存中的情况（complete 时直接标记为已加载）
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className="relative w-full">
      {/* Skeleton 占位 */}
      {!loaded && (
        <Skeleton
          className={`aspect-video w-full rounded-xl ${skeletonClassName}`}
        />
      )}

      {/* 实际图片 - 加载完成后淡入 */}
      {/* biome-ignore lint/nursery/useImageSize: GIF images with dynamic sizes */}
      {/* biome-ignore lint/performance/noImgElement: GIF needs raw img for animation */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad is not user interaction */}
      <img
        alt={alt}
        className={`w-full transition-opacity duration-500 ${
          loaded ? "opacity-100" : "absolute inset-0 opacity-0"
        } ${className}`}
        onLoad={() => setLoaded(true)}
        ref={imgRef}
        src={src}
      />
    </div>
  );
}
