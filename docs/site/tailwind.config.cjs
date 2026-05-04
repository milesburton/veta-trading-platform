/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{astro,md,mdx,html,ts,tsx}",
    "../../frontend/src/components/primitives/**/*.{ts,tsx}",
    "../../frontend/src/components/StatusDot.tsx",
    "../../frontend/src/components/BuildInfo.tsx",
    "../../frontend/src/components/ServiceRow.tsx",
    "../../frontend/src/components/AssetSelector.tsx",
    "../../frontend/src/components/ContextMenu.tsx",
  ],
  corePlugins: {
    preflight: false,
  },
};
