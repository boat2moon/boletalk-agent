import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone",
  // PDF 文件经 base64 编码后体积会膨胀约 33%，默认 10MB 限制不够用
  // 简历 PDF 通常几百 KB ~ 几 MB，20MB 足够覆盖
  proxyClientMaxBodySize: "20mb",
  images: {
    remotePatterns: [
      {
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        //https://nextjs.org/docs/messages/next-image-unconfigured-host
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
} satisfies NextConfig & { proxyClientMaxBodySize?: string };

export default nextConfig;
