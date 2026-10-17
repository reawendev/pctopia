// Gezinme ikonları (20px, çizgi). Tek renk: currentColor.

const PATHS: Record<string, string> = {
  ofis: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  uretim: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  borsa: "M4 19h16M6 16l4-5 3 3 5-7M15 7h3v3",
  posta: "M3 6h18v12H3zM3 7l9 6 9-6",
  hayat: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  gundem: "M4 10v4h3l6 4V6L7 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
};

export function Icon({ name, className = "" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
