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
        canvas: "#f6f1e8",
        ink: "#1d2322",
        tide: "#2c6e66",
        sand: "#e8d7b4",
        ember: "#bf5b37",
        slate: "#52606d",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(29, 35, 34, 0.08)",
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(232, 215, 180, 0.7), transparent 45%), radial-gradient(circle at right center, rgba(44, 110, 102, 0.12), transparent 42%), linear-gradient(180deg, #fcfaf6 0%, #f3ede1 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
