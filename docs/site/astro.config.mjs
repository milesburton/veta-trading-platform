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
          label: "Mission Control",
          items: [
            { label: "Diagnostic dashboard", slug: "mission-control" },
          ],
        },
        {
          label: "Getting Started",
          items: [
            { label: "Overview", slug: "guides/overview" },
            { label: "Quick start", slug: "guides/quick-start" },
            { label: "Personas", slug: "guides/personas" },
          ],
        },
        {
          label: "User Guide",
          items: [
            {
              label: "Trading",
              items: [
                { label: "Placing orders", slug: "user-guide/placing-orders" },
                { label: "Managing orders", slug: "user-guide/managing-orders" },
                { label: "Algo trading", slug: "user-guide/algo-trading" },
                { label: "Risk controls", slug: "user-guide/risk-controls" },
              ],
            },
            {
              label: "Markets",
              items: [
                { label: "Market monitoring", slug: "user-guide/market-monitoring" },
                { label: "Finding instruments", slug: "user-guide/finding-instruments" },
                { label: "Fixed income", slug: "user-guide/fixed-income" },
              ],
            },
            { label: "Admin tools", slug: "user-guide/admin-tools" },
          ],
        },
        {
          label: "Platform",
          items: [
            { label: "Professional standards", slug: "platform/professional-standards" },
            { label: "Threat model", slug: "platform/threat-model" },
            { label: "Risk architecture", slug: "platform/risk-architecture" },
            {
              label: "How it works",
              items: [
                { label: "Architecture", slug: "platform/architecture" },
                { label: "Service map", slug: "platform/services" },
                { label: "Algo strategies", slug: "platform/algos" },
                { label: "Risk controls", slug: "platform/risk" },
                { label: "Scenarios", slug: "platform/scenarios" },
              ],
            },
            {
              label: "Operations",
              items: [
                { label: "Observability", slug: "platform/observability" },
                {
                  label: "Supporting services",
                  collapsed: true,
                  items: [
                    { label: "Overview", slug: "platform/supporting-services" },
                    { label: "Traefik", slug: "platform/supporting/traefik" },
                    { label: "k6 load testing", slug: "platform/supporting/k6-load-testing" },
                    { label: "Disk monitor", slug: "platform/supporting/disk-monitor" },
                    { label: "db-migrate", slug: "platform/supporting/db-migrate" },
                    { label: "Redpanda console", slug: "platform/supporting/redpanda-console" },
                    { label: "Watchtower", slug: "platform/supporting/watchtower" },
                    { label: "flyctl", slug: "platform/supporting/flyctl" },
                  ],
                },
                { label: "Security posture", slug: "platform/security" },
                { label: "Screenshots", slug: "platform/screenshots" },
              ],
            },
          ],
        },
        {
          label: "Development",
          items: [
            { label: "Coding approach", slug: "development/coding-approach" },
            { label: "Project structure", slug: "development/structure" },
            { label: "Testing", slug: "development/testing" },
            { label: "Testcontainers", slug: "development/testcontainers" },
            { label: "CI / CD", slug: "development/ci-cd" },
            { label: "Deployment", slug: "development/deployment" },
            { label: "Shared modules", slug: "development/shared-modules" },
            { label: "Source references", slug: "development/source-references" },
            { label: "Contributing", slug: "development/contributing" },
            { label: "Roadmap", slug: "development/roadmap" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Glossary", slug: "reference/glossary" },
            { label: "API gateway", slug: "reference/api-gateway" },
            { label: "RBAC & permissions", slug: "reference/rbac" },
            { label: "Trading styles", slug: "reference/trading-styles" },
            { label: "Panel reference", slug: "reference/panels" },
            { label: "Migrations", slug: "reference/migrations" },
            { label: "Performance", slug: "reference/performance" },
            { label: "Tech stack", slug: "reference/tech-stack" },
          ],
        },
      ],
      customCss: ["./src/styles/tailwind.css", "./src/styles/custom.css"],
      components: {
        Header: "./src/components/Header.astro",
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
            bindMermaidLightbox();

            // Click-to-expand on rendered mermaid diagrams. The shared
            // .veta-lightbox styles are extended in custom.css to handle
            // SVG children with overflow:auto so wide diagrams remain
            // navigable inside the modal.
            function openMermaidLightbox(sourceNode) {
              const svg = sourceNode.querySelector("svg");
              if (!svg) return;
              const overlay = document.createElement("div");
              overlay.className = "veta-lightbox veta-lightbox--mermaid";
              overlay.setAttribute("role", "dialog");
              overlay.setAttribute("aria-modal", "true");
              overlay.setAttribute("aria-label", "Diagram preview");
              const inner = document.createElement("div");
              inner.className = "veta-lightbox-scroll";
              const clone = svg.cloneNode(true);
              // Strip width/height so the SVG uses its intrinsic viewBox
              // dimensions; CSS controls the rendered size.
              clone.removeAttribute("width");
              clone.removeAttribute("height");
              clone.removeAttribute("style");
              inner.appendChild(clone);
              const closeBtn = document.createElement("button");
              closeBtn.type = "button";
              closeBtn.className = "veta-lightbox-close";
              closeBtn.setAttribute("aria-label", "Close diagram preview");
              closeBtn.textContent = "×";
              overlay.append(inner, closeBtn);
              document.body.append(overlay);
              document.body.style.overflow = "hidden";

              function close() {
                overlay.remove();
                document.body.style.overflow = "";
                document.removeEventListener("keydown", onKey);
              }
              function onKey(e) {
                if (e.key === "Escape") close();
              }
              // Close on overlay click but not on diagram-content click.
              overlay.addEventListener("click", (e) => {
                if (e.target === overlay || e.target === inner) close();
              });
              closeBtn.addEventListener("click", close);
              document.addEventListener("keydown", onKey);
            }

            function bindMermaidLightbox() {
              for (const node of document.querySelectorAll(".mermaid")) {
                if (node.dataset.lightboxBound === "1") continue;
                node.dataset.lightboxBound = "1";
                node.style.cursor = "zoom-in";
                node.title = "Click to expand";
                node.addEventListener("click", () => openMermaidLightbox(node));
              }
            }

            async function rerenderAll() {
              configure();
              const nodes = document.querySelectorAll(".mermaid");
              for (const node of nodes) {
                const src = sources.get(node);
                if (!src) continue;
                node.removeAttribute("data-processed");
                node.innerHTML = src;
                delete node.dataset.lightboxBound;
              }
              await mermaid.run({ nodes });
              bindMermaidLightbox();
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
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
            // Lightbox: click any content image to open it full-screen.
            // Click anywhere or press Esc to close.
            const SELECTOR = ".sl-markdown-content img:not(.sl-no-zoom):not([data-no-zoom])";

            function openLightbox(src, alt) {
              const overlay = document.createElement("div");
              overlay.className = "veta-lightbox";
              overlay.setAttribute("role", "dialog");
              overlay.setAttribute("aria-modal", "true");
              overlay.setAttribute("aria-label", alt || "Image preview");
              const img = document.createElement("img");
              img.src = src;
              img.alt = alt || "";
              const closeBtn = document.createElement("button");
              closeBtn.type = "button";
              closeBtn.className = "veta-lightbox-close";
              closeBtn.setAttribute("aria-label", "Close image preview");
              closeBtn.textContent = "×";
              overlay.append(img, closeBtn);
              document.body.append(overlay);
              document.body.style.overflow = "hidden";

              function close() {
                overlay.remove();
                document.body.style.overflow = "";
                document.removeEventListener("keydown", onKey);
              }
              function onKey(e) {
                if (e.key === "Escape") close();
              }
              overlay.addEventListener("click", close);
              document.addEventListener("keydown", onKey);
            }

            function bind() {
              for (const img of document.querySelectorAll(SELECTOR)) {
                if (img.dataset.lightboxBound === "1") continue;
                img.dataset.lightboxBound = "1";
                img.style.cursor = "zoom-in";
                img.addEventListener("click", () => openLightbox(img.src, img.alt));
              }
            }
            bind();
            // Re-bind when Starlight swaps content via client navigation.
            new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
          `,
        },
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
            // Hyperlink copy: clicking any heading anchor or external link in
            // the markdown content copies the URL to the clipboard, with a
            // brief inline toast confirming the copy. Normal navigation still
            // happens for non-anchor links via shift/ctrl/cmd-click.
            const HEADING_SELECTOR = ".sl-markdown-content :is(h2, h3, h4, h5, h6)";

            function showToast(target, message) {
              const toast = document.createElement("span");
              toast.className = "veta-copy-toast";
              toast.textContent = message;
              target.appendChild(toast);
              requestAnimationFrame(() => toast.classList.add("is-visible"));
              setTimeout(() => {
                toast.classList.remove("is-visible");
                setTimeout(() => toast.remove(), 200);
              }, 1300);
            }

            async function copy(text) {
              try {
                await navigator.clipboard.writeText(text);
                return true;
              } catch {
                return false;
              }
            }

            function bindHeadingCopy() {
              for (const heading of document.querySelectorAll(HEADING_SELECTOR)) {
                if (!heading.id || heading.dataset.copyBound === "1") continue;
                heading.dataset.copyBound = "1";
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "veta-anchor-copy";
                btn.setAttribute("aria-label", "Copy link to this section");
                btn.title = "Copy link";
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
                btn.addEventListener("click", async (e) => {
                  e.preventDefault();
                  const url = new URL(window.location.href);
                  url.hash = heading.id;
                  const ok = await copy(url.toString());
                  showToast(heading, ok ? "Copied" : "Press ⌘C");
                });
                heading.appendChild(btn);
              }
            }

            bindHeadingCopy();
            new MutationObserver(bindHeadingCopy).observe(document.body, { childList: true, subtree: true });
          `,
        },
      ],
    }),
  ],
});
