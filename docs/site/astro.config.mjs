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
    }),
  ],
});
