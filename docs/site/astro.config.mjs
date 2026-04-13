import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
export default defineConfig({
  site: "https://milesburton.github.io",
  base: "/veta-trading-platform",
  integrations: [
    starlight({
      title: "VETA Trading Platform",
      description:
        "A near real-world equities and fixed income trading platform for paper trading and learning market dynamics.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/milesburton/veta-trading-platform",
        },
      ],
      logo: {
        alt: "VETA",
        src: "./src/assets/logo.svg",
      },
      editLink: {
        baseUrl:
          "https://github.com/milesburton/veta-trading-platform/edit/main/docs/site/",
      },
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Platform",
          autogenerate: { directory: "platform" },
        },
        {
          label: "Development",
          autogenerate: { directory: "development" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
            import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
            mermaid.initialize({ startOnLoad: false, theme: "dark" });
            document.querySelectorAll('pre[data-language="mermaid"]').forEach((pre) => {
              const code = pre.querySelector("code");
              if (!code) return;
              const figure = pre.closest("figure") || pre.closest(".expressive-code") || pre;
              const div = document.createElement("div");
              div.classList.add("mermaid");
              div.textContent = code.textContent;
              figure.replaceWith(div);
            });
            await mermaid.run();
          `,
        },
      ],
    }),
  ],
});
