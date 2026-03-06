import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/chat/", "/login", "/register"],
    },
    sitemap: "https://boletalk.chat/sitemap.xml",
  };
}
