import type { MetadataRoute } from "next";

// Ana ekrana ekleme / Play Store (TWA veya Capacitor) için uygulama tanımı
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PCTopia",
    short_name: "PCTopia",
    description: "Bir garajda kur, holdinge dönüştür. Çok oyunculu bilgisayar şirketi simülasyonu.",
    lang: "tr",
    start_url: "/oyun",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0E1828",
    theme_color: "#0E1828",
    categories: ["games", "simulation"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
