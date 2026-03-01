"use client";

export function ScrollToTopLink() {
  return (
    // biome-ignore lint/a11y/useValidAnchor: scroll-to-top uses anchor with onClick
    <a
      className="cursor-pointer font-semibold text-blue-600 text-lg"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      伯乐Talk
    </a>
  );
}
