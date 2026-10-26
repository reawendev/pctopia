import type { Config } from "tailwindcss";

// "Yönetim katı" paleti: lake lacivert, pirinç, fildişi.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Dokunmatik ekranda hover renkleri "takılı" kalmasın
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        ink: "#0E1828", // zemin
        panel: "#142236", // kart
        raised: "#1B2C44", // yükseltilmiş yüzey / aktif sekme
        line: "#263A57", // çizgiler
        mute: "#93A1B5", // ikincil metin
        white: "#EDE6D6", // fildişi ana metin
        amber: { DEFAULT: "#C9A24A", dim: "#A48231", soft: "#E3C987" }, // pirinç
        gain: "#6FBF8B", // muhasebe yeşili
        loss: "#D46A5A", // mühür kırmızısı
      },
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        // Logo ve giriş başlıkları. Akira Expanded lisansı alınırsa globals.css'teki @font-face açılır ve öne geçer.
        display: ['"Akira Expanded"', '"Unbounded Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"IBM Plex Serif"', "Georgia", "serif"],
        mono: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
