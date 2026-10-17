// PC Atölyesi: oyuncunun tasarladığı toplama PC modelleri, adil değer ve talep.
// Saf fonksiyonlar; sunucu ve istemci aynı hesabı yapar.

export type Quality = "low" | "mid" | "high";
export type Slot = "cpu" | "gpu" | "ram" | "ssd";
export type Parts = Record<Slot, Quality>;

export const QUALITY_LABEL: Record<Quality, string> = { low: "Ekonomik", mid: "Orta", high: "Üst seviye" };
export const SLOT_LABEL: Record<Slot, string> = { cpu: "İşlemci", gpu: "Ekran kartı", ram: "Bellek", ssd: "Depolama" };
export const SLOTS: Slot[] = ["cpu", "gpu", "ram", "ssd"];
export const QUALITIES: Quality[] = ["low", "mid", "high"];

export const PARTS: Record<Slot, Record<Quality, { name: string; cost: number; score: number }>> = {
  cpu: {
    low: { name: "4 çekirdekli giriş işlemcisi", cost: 80, score: 10 },
    mid: { name: "8 çekirdekli orta sınıf işlemci", cost: 200, score: 22 },
    high: { name: "16 çekirdekli üst sınıf işlemci", cost: 450, score: 40 },
  },
  gpu: {
    low: { name: "Dahili grafik / giriş kartı", cost: 100, score: 10 },
    mid: { name: "Orta sınıf ekran kartı", cost: 300, score: 25 },
    high: { name: "Amiral gemisi ekran kartı", cost: 800, score: 50 },
  },
  ram: {
    low: { name: "8 GB bellek", cost: 30, score: 4 },
    mid: { name: "16 GB bellek", cost: 70, score: 8 },
    high: { name: "32 GB hızlı bellek", cost: 160, score: 14 },
  },
  ssd: {
    low: { name: "256 GB SSD", cost: 40, score: 4 },
    mid: { name: "1 TB NVMe SSD", cost: 90, score: 8 },
    high: { name: "2 TB üst seviye NVMe", cost: 180, score: 12 },
  },
};

export const ASSEMBLY_COST = 60; // kasa, güç kaynağı, montaj
export const PART_MARKUP = 1.35; // piyasa parça değerini maliyetin bu katı sayar
export const MAX_MODELS = 5;
export const MAX_STOCK = 500;
export const SALES_CAP_HOURS = 12; // oyuncu yokken en fazla kaç saatlik satış birikir
export const OVERPRICE_LIMIT = 1.5; // adil değerin bu katının üstünde hiç satılmaz
export const MAX_LIST_RATIO = 2; // bundan pahalıya etikete bile yazılamaz

const RANK: Record<Quality, number> = { low: 0, mid: 1, high: 2 };

export function isValidParts(x: any): x is Parts {
  return !!x && SLOTS.every((s) => QUALITIES.includes(x[s]));
}

/** Tek bir birimin üretim maliyeti (indirim oranıyla). */
export function unitCost(parts: Parts, discount = 0): number {
  const raw = ASSEMBLY_COST + SLOTS.reduce((s, k) => s + PARTS[k][parts[k]].cost, 0);
  return Math.round(raw * (1 - discount));
}

export function performanceScore(parts: Parts): number {
  return SLOTS.reduce((s, k) => s + PARTS[k][parts[k]].score, 0);
}

/** İşlemci ile ekran kartı arasında iki kademe fark varsa sistem dengesizdir (darboğaz). */
export function isBottlenecked(parts: Parts): boolean {
  return Math.abs(RANK[parts.cpu] - RANK[parts.gpu]) >= 2;
}

/** Segment: oyunda ve sosyal medyada nasıl anıldığı. */
export function segment(parts: Parts): string {
  const s = performanceScore(parts);
  if (s < 40) return "ofis";
  if (s < 70) return "oyun";
  if (s < 100) return "üst segment oyun";
  return "iş istasyonu";
}

/**
 * Piyasanın bu modele biçtiği "hak ettiği fiyat".
 * Parçaların piyasa değeri + montaj, darboğazda %12 indirim, itibara göre ±%10.
 */
export function fairValue(parts: Parts, reputation: number): number {
  const parts$ = SLOTS.reduce((s, k) => s + PARTS[k][parts[k]].cost * PART_MARKUP, 0);
  let v = parts$ + ASSEMBLY_COST * 1.5;
  if (isBottlenecked(parts)) v *= 0.88;
  v *= 0.9 + Math.max(0, Math.min(100, reputation)) / 500;
  return Math.round(v / 10) * 10;
}

/** Fiyat/değer oranına göre talep çarpanı. 1,5 katın üstünde satış yok. */
export function priceFactor(price: number, fair: number): number {
  const r = price / fair;
  if (r > OVERPRICE_LIMIT) return 0;
  if (r <= 1) return 1 + 1.2 * (1 - Math.max(r, 0.5));
  return Math.exp(-3 * (r - 1));
}

/** Saatte satılan beklenen adet. */
export function salesRate(opts: { parts: Parts; price: number; reputation: number; stageLevel: number; demandBonus?: number }): number {
  const fair = fairValue(opts.parts, opts.reputation);
  const base = 3 / (1 + performanceScore(opts.parts) / 60); // ucuz segment daha çok satar
  const stage = 1 + 0.25 * (opts.stageLevel - 1);
  const rep = 0.6 + Math.max(0, Math.min(100, opts.reputation)) / 125; // itibar 50 → 1,0
  return base * stage * rep * priceFactor(opts.price, fair) * (1 + (opts.demandBonus ?? 0));
}

export type PriceVerdict = "fahiş" | "pahalı" | "piyasa" | "uygun" | "kelepir";

export function verdict(price: number, fair: number): PriceVerdict {
  const r = price / fair;
  if (r > OVERPRICE_LIMIT) return "fahiş";
  if (r > 1.15) return "pahalı";
  if (r >= 0.9) return "piyasa";
  if (r >= 0.7) return "uygun";
  return "kelepir";
}

/** Bekleyen satışları hesaplar (gelir gibi tembel). */
export function pendingSales(opts: {
  rate: number;
  stock: number;
  carry: number;
  lastSaleMs: number;
  nowMs: number;
}): { sold: number; carry: number } {
  const hours = Math.min(SALES_CAP_HOURS, Math.max(0, (opts.nowMs - opts.lastSaleMs) / 3_600_000));
  const expected = opts.rate * hours + opts.carry;
  const whole = Math.floor(expected);
  if (whole >= opts.stock) return { sold: opts.stock, carry: 0 };
  return { sold: whole, carry: expected - whole };
}
