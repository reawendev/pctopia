import type { Metadata, Viewport } from "next";
// Gövde: Geist (Google Fonts). Logo / giriş başlıkları: Unbounded (Google Fonts).
import "@fontsource-variable/geist";
import "@fontsource-variable/unbounded";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/600.css";
import "@fontsource/ibm-plex-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCTopia",
  description: "Bir garajda kur, holdinge dönüştür. Çok oyunculu bilgisayar şirketi simülasyonu.",
  applicationName: "PCTopia",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PCTopia", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0E1828",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-[100dvh] antialiased">
        <div className="safe-top" aria-hidden />
        {children}
      </body>
    </html>
  );
}
