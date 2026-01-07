import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "log-green": "#4CAF50",
        "sky-blue": "#00BFFF",
        "graphite": "#333333",
        "steel-gray": "#9E9E9E",
      },
    },
  },
  plugins: [],
} satisfies Config;
