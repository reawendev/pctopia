// Oyun dengesi burada. Sunucu ve istemci aynı dosyayı kullanır.

export const START_CASH = 1_000;
export const OFFLINE_CAP_HOURS = 12; // oyuncu yokken en fazla kaç saatlik gelir birikir
export const COST_GROWTH = 1.15; // her ek birimde maliyet çarpanı
export const RESALE_RATIO = 0.5; // sıralamada ekipman değeri oranı

export type Equipment = {
  id: string;
  tier: number;
  name: string;
  desc: string;
  baseCost: number;
  incomePerHour: number;
};

export const EQUIPMENT: Equipment[] = [
  { id: "used-pc", tier: 1, name: "İkinci El Ofis PC", desc: "Eski ama çalışıyor. Her şirket buradan başlar.", baseCost: 400, incomePerHour: 40 },
  { id: "office-desktop", tier: 2, name: "Ofis Masaüstü", desc: "Muhasebe ve temel müşteri işleri için.", baseCost: 2_000, incomePerHour: 180 },
  { id: "gaming-pc", tier: 3, name: "Yüksek Performanslı PC", desc: "Render ve oyun sunucusu işleri.", baseCost: 9_000, incomePerHour: 750 },
  { id: "workstation", tier: 4, name: "Profesyonel İş İstasyonu", desc: "Mühendislik ve tasarım sözleşmeleri.", baseCost: 45_000, incomePerHour: 3_500 },
  { id: "server-rack", tier: 5, name: "Sunucu Rafı", desc: "Barındırma hizmeti sunmaya başla.", baseCost: 250_000, incomePerHour: 17_500 },
  { id: "gpu-cluster", tier: 6, name: "GPU Kümesi", desc: "Yapay zekâ eğitimi ve hesaplama kiralama.", baseCost: 1_500_000, incomePerHour: 95_000 },
  { id: "data-center", tier: 7, name: "Veri Merkezi", desc: "Kurumsal müşteriler için bölgesel altyapı.", baseCost: 12_000_000, incomePerHour: 700_000 },
  { id: "supercomputer", tier: 8, name: "Süper Bilgisayar", desc: "Devlet ve savunma ihaleleri seviyesi.", baseCost: 100_000_000, incomePerHour: 5_500_000 },
];

export const EQUIPMENT_BY_ID: Record<string, Equipment> = Object.fromEntries(
  EQUIPMENT.map((e) => [e.id, e])
);

// Logo ve karakter seçenekleri (sunucu doğrulaması için)
export const LOGO_SHAPES = ["circle", "square", "hex", "shield"] as const;
export const LOGO_SYMBOLS = ["chip", "bolt", "diamond", "peak", "ring"] as const;
export const LOGO_COLORS = ["#f2b441", "#4ade80", "#38bdf8", "#f87171", "#a78bfa", "#e2e8f0", "#fb923c", "#2dd4bf"] as const;
export const LOGO_BG = ["#0f172a", "#111827", "#1e293b", "#1c1917", "#022c22", "#1e1b4b", "#450a0a", "#ffffff"] as const;

export const SKINS = ["#f1d3b8", "#e0b48c", "#c68b5f", "#8d5a3b", "#5b3a29"] as const;
export const HAIR_STYLES = ["short", "side", "long", "bald"] as const;
export const HAIR_COLORS = ["#1a1411", "#4a2f1b", "#8a5a2b", "#c9a15a", "#9ca3af", "#7c2d12"] as const;
export const SUITS = ["#1f2937", "#0f2a43", "#3b1d2a", "#14352a", "#44403c"] as const;
export const ACCESSORIES = ["none", "glasses", "beard"] as const;

export type LogoSpec = {
  shape: (typeof LOGO_SHAPES)[number];
  symbol: (typeof LOGO_SYMBOLS)[number];
  color: string;
  bg: string;
};

export type CharacterSpec = {
  skin: string;
  hair: (typeof HAIR_STYLES)[number];
  hairColor: string;
  suit: string;
  accessory: (typeof ACCESSORIES)[number];
};

export const DEFAULT_LOGO: LogoSpec = { shape: "hex", symbol: "chip", color: LOGO_COLORS[0], bg: LOGO_BG[0] };
export const DEFAULT_CHARACTER: CharacterSpec = {
  skin: SKINS[1],
  hair: "short",
  hairColor: HAIR_COLORS[0],
  suit: SUITS[0],
  accessory: "none",
};

export function isValidLogo(x: any): x is LogoSpec {
  return (
    x &&
    (LOGO_SHAPES as readonly string[]).includes(x.shape) &&
    (LOGO_SYMBOLS as readonly string[]).includes(x.symbol) &&
    (LOGO_COLORS as readonly string[]).includes(x.color) &&
    (LOGO_BG as readonly string[]).includes(x.bg)
  );
}

export function isValidCharacter(x: any): x is CharacterSpec {
  return (
    x &&
    (SKINS as readonly string[]).includes(x.skin) &&
    (HAIR_STYLES as readonly string[]).includes(x.hair) &&
    (HAIR_COLORS as readonly string[]).includes(x.hairColor) &&
    (SUITS as readonly string[]).includes(x.suit) &&
    (ACCESSORIES as readonly string[]).includes(x.accessory)
  );
}
