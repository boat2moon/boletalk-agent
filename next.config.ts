import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone",
  transpilePackages: ["@ai-sdk/openai"],
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
  // 非主域名 → 301 永久重定向到 www.bltalk.top
  // 裸域和 www 域名的 Cookie 不共享，不统一会导致登录状态丢失
  redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "bltalk.top" }],
        destination: "https://www.bltalk.top/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "boletalk.top" }],
        destination: "https://www.bltalk.top/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.boletalk.top" }],
        destination: "https://www.bltalk.top/:path*",
        permanent: true,
      },
    ];
  },
} satisfies NextConfig & { proxyClientMaxBodySize?: string };

export default nextConfig;
