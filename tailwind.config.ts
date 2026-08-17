import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FFFDF9",
        paper: "#FFF8F2",
        ink: "#2B2523",
        blush: "#E8A7B8",
        rose: "#C9788F",
        umber: "#806C63",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
        hand: ["var(--font-caveat)", "cursive"],
      },
      keyframes: {
        "pulse-heart": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.15)", opacity: "0.8" },
        },
        "shutter-flash": {
          "0%": { opacity: "0" },
          "10%": { opacity: "0.9" },
          "100%": { opacity: "0" },
        },
        "slide-up": {
          "0%": { transform: "translateY(40px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "grain": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "10%": { transform: "translate(-2%, -3%)" },
          "30%": { transform: "translate(3%, 2%)" },
          "50%": { transform: "translate(-3%, 3%)" },
          "70%": { transform: "translate(2%, -2%)" },
          "90%": { transform: "translate(-2%, 2%)" },
        },
      },
      animation: {
        "pulse-heart": "pulse-heart 1.6s ease-in-out infinite",
        "shutter-flash": "shutter-flash 400ms ease-out",
        "slide-up": "slide-up 700ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 600ms ease-out",
        "grain": "grain 1s steps(4) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
