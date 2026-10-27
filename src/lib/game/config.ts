// Oyun dengesi burada. Sunucu ve istemci aynı dosyayı kullanır.

export const START_CASH = 3_000;
export const OFFLINE_CAP_HOURS = 12; // oyuncu yokken en fazla kaç saatlik gelir birikir
export const COST_GROWTH = 1.15; // her ek birimde maliyet çarpanı
export const RESALE_RATIO = 0.5; // sıralamada ekipman değeri oranı
// Gelir hızı çarpanı: tablodaki taban gelirler bununla çarpılır (4 → makineler kendini 2,5–4,5 saatte öder)
export const INCOME_SPEED = 4; // geç oyun (sunucu rafı ve üstü)
// Erken oyun daha hızlı: ilk iki kademe x10, üçüncü ve dördüncü x6
const EARLY = 10;
const MID = 6;

export type Equipment = {
  id: string;
  tier: number;
  name: string;
  desc: string;
  baseCost: number;
  incomePerHour: number;
};

export const EQUIPMENT: Equipment[] = [
  { id: "used-pc", tier: 1, name: "İkinci El Ofis PC", desc: "Eski ama çalışıyor. Her şirket buradan başlar.", baseCost: 400, incomePerHour: 40 * EARLY },
  { id: "office-desktop", tier: 2, name: "Ofis Masaüstü", desc: "Muhasebe ve temel müşteri işleri için.", baseCost: 2_000, incomePerHour: 180 * EARLY },
  { id: "gaming-pc", tier: 3, name: "Yüksek Performanslı PC", desc: "Render ve oyun sunucusu işleri.", baseCost: 9_000, incomePerHour: 750 * MID },
  { id: "workstation", tier: 4, name: "Profesyonel İş İstasyonu", desc: "Mühendislik ve tasarım sözleşmeleri.", baseCost: 45_000, incomePerHour: 3_500 * MID },
  { id: "server-rack", tier: 5, name: "Sunucu Rafı", desc: "Barındırma hizmeti sunmaya başla.", baseCost: 250_000, incomePerHour: 17_500 * INCOME_SPEED },
  { id: "gpu-cluster", tier: 6, name: "GPU Kümesi", desc: "Yapay zekâ eğitimi ve hesaplama kiralama.", baseCost: 1_500_000, incomePerHour: 95_000 * INCOME_SPEED },
  { id: "data-center", tier: 7, name: "Veri Merkezi", desc: "Kurumsal müşteriler için bölgesel altyapı.", baseCost: 12_000_000, incomePerHour: 700_000 * INCOME_SPEED },
  { id: "supercomputer", tier: 8, name: "Süper Bilgisayar", desc: "Devlet ve savunma ihaleleri seviyesi.", baseCost: 100_000_000, incomePerHour: 5_500_000 * INCOME_SPEED },
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
export const HAIR_STYLES = ["short", "side", "slick", "undercut", "curly", "wavy", "afro", "long", "bob", "bun", "ponytail", "bald"] as const;
export const HAIR_COLORS = ["#1a1411", "#4a2f1b", "#8a5a2b", "#c9a15a", "#9ca3af", "#7c2d12"] as const;
export const SUITS = ["#1f2937", "#0f2a43", "#3b1d2a", "#14352a", "#44403c"] as const;
/** Eski tek seçimli ayrıntı (eski kayıtlar için). Yeni ekran yüz kılı ve gözlüğü ayrı seçer. */
export const ACCESSORIES = ["none", "glasses", "beard"] as const;
export const GENDERS = ["man", "woman"] as const;
export const AGES = ["young", "middle", "senior"] as const;
// Yüz
export const EYES = ["round", "almond", "narrow", "sleepy"] as const;
export const BROWS = ["soft", "arched", "thick", "straight"] as const;
export const MOUTHS = ["smile", "grin", "neutral", "smirk"] as const;
// Aksesuar
export const FACIAL = ["none", "stubble", "mustache", "goatee", "beard"] as const;
export const EYEWEAR = ["none", "glasses", "round", "sunglasses"] as const;
export const HEADWEAR = ["none", "beanie", "cap", "fedora", "headphones"] as const;
export const EARRINGS = ["none", "stud", "hoop"] as const;
// Kıyafet ve arka plan
export const OUTFITS = ["suit", "bowtie", "blazer", "turtleneck", "shirt", "hoodie"] as const;
export const TIE_COLORS = ["#7f1d1d", "#1e3a8a", "#a16207", "#14532d", "#111827", "#9d174d"] as const;
export const BACKDROPS = ["dark", "office", "city", "brass", "teal", "wine"] as const;

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
  // Sonradan eklendi; eski kayıtlarda olmayabilir (yoksa varsayılan çizilir)
  gender?: (typeof GENDERS)[number];
  age?: (typeof AGES)[number];
  eyes?: (typeof EYES)[number];
  brows?: (typeof BROWS)[number];
  mouth?: (typeof MOUTHS)[number];
  facial?: (typeof FACIAL)[number];
  eyewear?: (typeof EYEWEAR)[number];
  headwear?: (typeof HEADWEAR)[number];
  earring?: (typeof EARRINGS)[number];
  outfit?: (typeof OUTFITS)[number];
  tie?: string;
  backdrop?: (typeof BACKDROPS)[number];
};

/** Eski "ayrıntı" alanı yeni alanlara çevrilir: gözlük ve sakal ayrı ayrı seçilebilir. */
export function facialOf(c: CharacterSpec): (typeof FACIAL)[number] {
  return c.facial ?? (c.accessory === "beard" ? "beard" : "none");
}
export function eyewearOf(c: CharacterSpec): (typeof EYEWEAR)[number] {
  return c.eyewear ?? (c.accessory === "glasses" ? "glasses" : "none");
}

export const DEFAULT_LOGO: LogoSpec = { shape: "hex", symbol: "chip", color: LOGO_COLORS[0], bg: LOGO_BG[0] };
export const DEFAULT_CHARACTER: CharacterSpec = {
  skin: SKINS[1],
  hair: "short",
  hairColor: HAIR_COLORS[0],
  suit: SUITS[0],
  accessory: "none",
  gender: "man",
  age: "middle",
  eyes: "almond",
  brows: "soft",
  mouth: "smile",
  facial: "none",
  eyewear: "none",
  headwear: "none",
  earring: "none",
  outfit: "suit",
  tie: TIE_COLORS[0],
  backdrop: "office",
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

/** İsteğe bağlı alan: yoksa geçerli, varsa listede olmalı. */
const opt = (v: unknown, list: readonly string[]) => v === undefined || (typeof v === "string" && list.includes(v));

export function isValidCharacter(x: any): x is CharacterSpec {
  return (
    x &&
    (SKINS as readonly string[]).includes(x.skin) &&
    (HAIR_STYLES as readonly string[]).includes(x.hair) &&
    (HAIR_COLORS as readonly string[]).includes(x.hairColor) &&
    (SUITS as readonly string[]).includes(x.suit) &&
    (ACCESSORIES as readonly string[]).includes(x.accessory) &&
    opt(x.gender, GENDERS) &&
    opt(x.age, AGES) &&
    opt(x.eyes, EYES) &&
    opt(x.brows, BROWS) &&
    opt(x.mouth, MOUTHS) &&
    opt(x.facial, FACIAL) &&
    opt(x.eyewear, EYEWEAR) &&
    opt(x.headwear, HEADWEAR) &&
    opt(x.earring, EARRINGS) &&
    opt(x.outfit, OUTFITS) &&
    opt(x.tie, TIE_COLORS) &&
    opt(x.backdrop, BACKDROPS)
  );
}
