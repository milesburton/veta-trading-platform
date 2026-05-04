import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

const frontendSrc = fileURLToPath(new URL("../../frontend/src", import.meta.url));
const docsBase = "/veta-trading-platform";

export default defineConfig({
  site: "https://milesburton.github.io",
  base: docsBase,
  vite: {
    resolve: {
      alias: {
        "@veta/frontend": frontendSrc,
      },
    },
  },
  integrations: [
    react(),
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
          label: "User Guide",
          autogenerate: { directory: "user-guide" },
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
      customCss: ["./src/styles/tailwind.css", "./src/styles/custom.css"],
      components: {
        Footer: "./src/components/Footer.astro",
      },
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: `${docsBase}/favicon.ico`,
            sizes: "any",
          },
        },
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
            import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
            mermaid.initialize({
              startOnLoad: false,
              theme: "dark",
              securityLevel: "loose",
              flowchart: { htmlLabels: true },
            });

            function extractMermaidSource(pre) {
              const lineNodes = pre.querySelectorAll(".ec-line .code");
              if (lineNodes.length > 0) {
                return Array.from(lineNodes)
                  .map((line) => (line.textContent ?? "").replace(/\u00a0/g, " "))
                  .join("\\n")
                  .trim();
              }
              const code = pre.querySelector("code");
              return (code?.textContent ?? "").replace(/\u00a0/g, " ").trim();
            }

            document.querySelectorAll('pre[data-language="mermaid"]').forEach((pre) => {
              const source = extractMermaidSource(pre);
              if (!source) return;
              const figure = pre.closest("figure") || pre.closest(".expressive-code") || pre;
              const div = document.createElement("div");
              div.classList.add("mermaid");
              div.textContent = source;
              figure.replaceWith(div);
            });
            await mermaid.run();
          `,
        },
      ],
    }),
  ],
});
