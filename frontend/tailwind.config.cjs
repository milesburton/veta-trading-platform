/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./src/**/*.stories.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
      colors: {
        gray: {
          50: "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
          950: "rgb(var(--gray-950) / <alpha-value>)",
        },
        // Purpose-named aliases over the gray scale, one per shade so each
        // existing usage has an exact replacement. Single-word color names
        // flatten into Tailwind utilities: `colors.muted` → `text-muted` /
        // `bg-muted` / `border-muted`. Each maps to a specific gray shade so
        // the four data-theme variants apply automatically.
        //   strong       (gray-50)  pure white — high-emphasis headings
        //   primary      (gray-100) primary text (~18:1 on page)
        //   secondary    (gray-200) strong secondary text (~12:1)
        //   default      (gray-300) body / value text (~8:1)
        //   label        (gray-400) secondary labels (~5.5:1)
        //   muted        (gray-500) muted labels (~3.5:1)
        //   subtle       (gray-600) disabled / decorative
        //   divider      (gray-700) subtle borders
        //   panel        (gray-800) panel backgrounds
        //   surface      (gray-900) surface backgrounds
        //   page         (gray-950) page background
        strong: "rgb(var(--gray-50) / <alpha-value>)",
        primary: "rgb(var(--gray-100) / <alpha-value>)",
        secondary: "rgb(var(--gray-200) / <alpha-value>)",
        default: "rgb(var(--gray-300) / <alpha-value>)",
        label: "rgb(var(--gray-400) / <alpha-value>)",
        muted: "rgb(var(--gray-500) / <alpha-value>)",
        subtle: "rgb(var(--gray-600) / <alpha-value>)",
        divider: "rgb(var(--gray-700) / <alpha-value>)",
        panel: "rgb(var(--gray-800) / <alpha-value>)",
        surface: "rgb(var(--gray-900) / <alpha-value>)",
        page: "rgb(var(--gray-950) / <alpha-value>)",
        semantic: {
          up: "rgb(var(--semantic-up) / <alpha-value>)",
          "up-dark": "rgb(var(--semantic-up-dark) / <alpha-value>)",
          down: "rgb(var(--semantic-down) / <alpha-value>)",
          "down-dark": "rgb(var(--semantic-down-dark) / <alpha-value>)",
          neutral: "rgb(var(--semantic-neutral) / <alpha-value>)",
          maker: "rgb(var(--semantic-maker) / <alpha-value>)",
          taker: "rgb(var(--semantic-taker) / <alpha-value>)",
          cross: "rgb(var(--semantic-cross) / <alpha-value>)",
          limit: "rgb(var(--semantic-limit) / <alpha-value>)",
          twap: "rgb(var(--semantic-twap) / <alpha-value>)",
          pov: "rgb(var(--semantic-pov) / <alpha-value>)",
          vwap: "rgb(var(--semantic-vwap) / <alpha-value>)",
          iceberg: "rgb(var(--semantic-iceberg) / <alpha-value>)",
          sniper: "rgb(var(--semantic-sniper) / <alpha-value>)",
          "arrival-price": "rgb(var(--semantic-arrival-price) / <alpha-value>)",
        },
        chart: {
          grid: "rgb(var(--chart-grid) / <alpha-value>)",
          axis: "rgb(var(--chart-axis) / <alpha-value>)",
          "tooltip-bg": "rgb(var(--chart-tooltip-bg) / <alpha-value>)",
          "tooltip-border": "rgb(var(--chart-tooltip-border) / <alpha-value>)",
        },
        heat: {
          "strong-up": "rgb(var(--heat-strong-up) / <alpha-value>)",
          "mid-up": "rgb(var(--heat-mid-up) / <alpha-value>)",
          up: "rgb(var(--heat-up) / <alpha-value>)",
          "light-up": "rgb(var(--heat-light-up) / <alpha-value>)",
          "faint-up": "rgb(var(--heat-faint-up) / <alpha-value>)",
          neutral: "rgb(var(--heat-neutral) / <alpha-value>)",
          "faint-down": "rgb(var(--heat-faint-down) / <alpha-value>)",
          down: "rgb(var(--heat-down) / <alpha-value>)",
          "mid-down": "rgb(var(--heat-mid-down) / <alpha-value>)",
          "strong-down": "rgb(var(--heat-strong-down) / <alpha-value>)",
          "deep-down": "rgb(var(--heat-deep-down) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
