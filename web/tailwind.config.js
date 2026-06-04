/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AWS-console-inspired neutrals + Floci orange accent
        squid: {
          900: "#0f1b2d", // deepest nav
          800: "#16243b",
          700: "#1b2a41",
          600: "#232f3e", // classic AWS top bar
        },
        floci: {
          DEFAULT: "#ec7211", // AWS-orange-ish accent
          dark: "#d35f0a",
          light: "#ff9900",
        },
        ink: {
          900: "#16191f",
          700: "#414750",
          500: "#5f6b7a",
          300: "#aab7b8",
        },
        panel: "#ffffff",
        canvas: "#f2f3f3",
        line: "#e5e7eb",
        link: "#0972d3",
        ok: "#1d8102",
        warn: "#b7791f",
        danger: "#d13212",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
        lg: ["16px", "22px"],
      },
      boxShadow: {
        card: "0 1px 1px rgba(0,28,36,.3), 0 1px 8px -2px rgba(0,28,36,.16)",
      },
    },
  },
  plugins: [],
};
