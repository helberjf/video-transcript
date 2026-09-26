import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#111412",
        midnight: "#171a18",
        navy: "#20251f",
        steel: "#2f3a33",
        ink: "#f4f2e8",
        tide: "#14b8a6",
        sand: "#f5c542",
        aqua: "#6ee7d8",
        ember: "#fb7185",
        slate: "#aeb5a6",
      },
      boxShadow: {
        panel: "0 18px 56px rgba(0, 0, 0, 0.26)",
      },
      keyframes: {
        "brand-wave": {
          "0%, 100%": { transform: "scaleY(0.45)", opacity: "0.65" },
          "50%": { transform: "scaleY(1)", opacity: "1" },
        },
        "brand-dot": {
          "0%, 80%, 100%": { opacity: "0.2" },
          "40%": { opacity: "1" },
        },
      },
      animation: {
        "brand-wave": "brand-wave 1.1s ease-in-out infinite",
        "brand-dot": "brand-dot 1.2s ease-in-out infinite",
      },
      backgroundImage: {
        mesh: "linear-gradient(180deg, #151915 0%, #101310 46%, #171a18 100%), linear-gradient(rgba(244,242,232,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(244,242,232,0.035) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
