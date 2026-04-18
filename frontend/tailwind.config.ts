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
        canvas: "#f0f4f8",
        ink: "#091535",
        tide: "#1a3a8f",
        sand: "#c8daf8",
        ember: "#dc2626",
        slate: "#4a617d",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(9, 21, 53, 0.10)",
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(200, 218, 248, 0.55), transparent 45%), radial-gradient(circle at right center, rgba(26, 58, 143, 0.05), transparent 42%), linear-gradient(180deg, #f7f9ff 0%, #edf2fb 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
