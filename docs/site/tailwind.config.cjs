/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{astro,md,mdx,html,ts,tsx}",
    "../../frontend/src/components/primitives/**/*.{ts,tsx}",
    "../../frontend/src/components/StatusDot.tsx",
  ],
  corePlugins: {
    preflight: false,
  },
};
