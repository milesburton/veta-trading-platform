import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

const frontendSrc = fileURLToPath(
  new URL("../../frontend/src", import.meta.url),
);
const docsBase = "/veta-trading-platform";

const docsNodeModules = fileURLToPath(
  new URL("./node_modules", import.meta.url),
);

export default defineConfig({
  site: "https://milesburton.github.io",
  base: docsBase,
  vite: {
    resolve: {
      alias: {
        "@veta/frontend": frontendSrc,
        "@preact/signals-react": `${docsNodeModules}/@preact/signals-react`,
        react: `${docsNodeModules}/react`,
        "react-dom": `${docsNodeModules}/react-dom`,
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
            type: "image/svg+xml",
            href: `${docsBase}/favicon.svg`,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "alternate icon",
            href: `${docsBase}/favicon.ico`,
            sizes: "any",
          },
        },
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
            import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

            function resolveTheme() {
              const attr = document.documentElement.dataset.theme;
              if (attr === "light") return "default";
              if (attr === "dark") return "dark";
              return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
            }

            function configure() {
              mermaid.initialize({
                startOnLoad: false,
                theme: resolveTheme(),
                securityLevel: "loose",
                flowchart: { htmlLabels: true },
              });
            }
            configure();

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

            const sources = new WeakMap();

            document.querySelectorAll('pre[data-language="mermaid"]').forEach((pre) => {
              const source = extractMermaidSource(pre);
              if (!source) return;
              const figure = pre.closest("figure") || pre.closest(".expressive-code") || pre;
              const div = document.createElement("div");
              div.classList.add("mermaid");
              div.textContent = source;
              sources.set(div, source);
              figure.replaceWith(div);
            });
            await mermaid.run();

            async function rerenderAll() {
              configure();
              const nodes = document.querySelectorAll(".mermaid");
              for (const node of nodes) {
                const src = sources.get(node);
                if (!src) continue;
                node.removeAttribute("data-processed");
                node.innerHTML = src;
              }
              await mermaid.run({ nodes });
            }

            const observer = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (m.type === "attributes" && m.attributeName === "data-theme") {
                  rerenderAll();
                  return;
                }
              }
            });
            observer.observe(document.documentElement, { attributes: true });
          `,
        },
      ],
    }),
  ],
});
