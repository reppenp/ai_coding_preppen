/** @type {import('tailwindcss').Config} */
// Palette/type/radius/shadow are intentionally NOT overridden here — DESIGN.md
// §4 picks values straight out of Tailwind's defaults (blue-700, gray scale,
// green-600/yellow-500/red-600, rounded-md, shadow-sm/md, system font stack),
// so the defaults already are the design system. Add overrides only if the
// brief later diverges from stock Tailwind.
export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
