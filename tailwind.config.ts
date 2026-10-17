import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0e13",
        panel: "#10161e",
        raised: "#161e29",
        line: "#222d3b",
        mute: "#8593a6",
        amber: { DEFAULT: "#f2b441", dim: "#b88726" },
        gain: "#4ade80",
        loss: "#f87171",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
