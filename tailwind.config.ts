import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "foreground-tertiary": "hsl(var(--foreground-tertiary))",
        card: "hsl(var(--card))",
        popover: "hsl(var(--popover))",
        header: "hsl(var(--header))",
        "surface-code": "hsl(var(--surface-code))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        link: "hsl(var(--link))",
        border: "hsl(var(--border))",
        "border-contrast": "hsl(var(--border-contrast))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Status pairs: tinted ground + saturated ink, always used together.
        "light-green": "var(--light-green)",
        "dark-green": "var(--dark-green)",
        "light-yellow": "var(--light-yellow)",
        "dark-yellow": "var(--dark-yellow)",
        "light-red": "var(--light-red)",
        "dark-red": "var(--dark-red)",
        "light-violet": "hsl(var(--light-violet))",
        "dark-violet": "hsl(var(--dark-violet))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Langfuse's scale, verbatim. It tops out at 1.5rem — a heading is
      // distinguished by weight and color, not by being large.
      fontSize: {
        xs: ["0.7rem", { lineHeight: "1.1rem" }],
        sm: ["0.825rem", { lineHeight: "1.25rem" }],
        base: ["0.9rem", { lineHeight: "1.4rem" }],
        lg: ["1.1rem", { lineHeight: "1.6rem" }],
        xl: ["1.2rem", { lineHeight: "1.7rem" }],
        "2xl": ["1.3rem", { lineHeight: "1.8rem" }],
        "3xl": ["1.5rem", { lineHeight: "2rem" }],
      },
      // 600 is the heaviest weight in the system. There is no bold.
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.18s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
