"use client";

import { BoleTalkIcon } from "@/components/icons/boletalk-icon";

export function ScrollToTopLink() {
  return (
    // biome-ignore lint/a11y/useValidAnchor: scroll-to-top uses anchor with onClick
    <a
      className="flex cursor-pointer items-center gap-1.5 font-semibold text-blue-600 text-lg"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      <BoleTalkIcon className="size-6" />
      伯乐Talk
    </a>
  );
}
