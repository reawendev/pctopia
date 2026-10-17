// PC Atölyesi: oyuncunun tasarladığı toplama PC modelleri, adil değer ve ORTAK pazar.
// Saf fonksiyonlar; sunucu ve istemci aynı hesabı yapar.

import type { SegmentId } from "./events";

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

export type PartMult = Partial<Record<Slot, number>>;

const partCost = (k: Slot, q: Quality, mult: PartMult) => PARTS[k][q].cost * (mult[k] ?? 1);

/** Tek bir birimin üretim maliyeti (ilişki indirimi ve dünya olayı fiyat çarpanlarıyla). */
export function unitCost(parts: Parts, discount = 0, mult: PartMult = {}): number {
  const raw = ASSEMBLY_COST + SLOTS.reduce((s, k) => s + partCost(k, parts[k], mult), 0);
  return Math.round(raw * (1 - discount));
}

export function performanceScore(parts: Parts): number {
  return SLOTS.reduce((s, k) => s + PARTS[k][parts[k]].score, 0);
}

/** İşlemci ile ekran kartı arasında iki kademe fark varsa sistem dengesizdir (darboğaz). */
export function isBottlenecked(parts: Parts): boolean {
  return Math.abs(RANK[parts.cpu] - RANK[parts.gpu]) >= 2;
}

export const SEGMENTS: Record<SegmentId, { label: string; base: number }> = {
  ofis: { label: "ofis", base: 1.9 },
  oyun: { label: "oyun", base: 1.55 },
  ust: { label: "üst segment oyun", base: 1.25 },
  is: { label: "iş istasyonu", base: 1.0 },
};
export const SEGMENT_IDS: SegmentId[] = ["ofis", "oyun", "ust", "is"];

export function segmentId(parts: Parts): SegmentId {
  const s = performanceScore(parts);
  if (s < 40) return "ofis";
  if (s < 70) return "oyun";
  if (s < 100) return "ust";
  return "is";
}

/** Segment adı: oyunda ve sosyal medyada nasıl anıldığı. */
export function segment(parts: Parts): string {
  return SEGMENTS[segmentId(parts)].label;
}

/**
 * Piyasanın bu modele biçtiği "hak ettiği fiyat".
 * Parçaların piyasa değeri + montaj, darboğazda %12 indirim, itibara göre ±%10.
 */
export function fairValue(parts: Parts, reputation: number, mult: PartMult = {}): number {
  const parts$ = SLOTS.reduce((s, k) => s + partCost(k, parts[k], mult) * PART_MARKUP, 0);
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

// ---- Ortak pazar ----
//
// Her segmentin saatlik toplam talebi var: D = 2 × taban × (1 + 0,5 × (satıcı şirket sayısı − 1)) × olay çarpanı.
// Her ilanın bir çekiciliği var: fiyat çarpanı × itibar × (1 + talep yararı). Pazarda ayrıca
// çekiciliği 1 olan kurgusal rakipler bulunur; böylece tek başına satan da pazarın tamamını alamaz.
// Satış hızı = D × kendi çekiciliği / (tüm çekicilikler + kurgusal rakipler).

export const OUTSIDE_APPEAL = 1;

export function appeal(price: number, fair: number, reputation: number, demandBonus = 0): number {
  return priceFactor(price, fair) * (0.6 + Math.max(0, Math.min(100, reputation)) / 125) * (1 + demandBonus);
}

export function segmentDemand(seg: SegmentId, sellers: number, eventMult = 1): number {
  return 2 * SEGMENTS[seg].base * (1 + 0.5 * (Math.max(1, sellers) - 1)) * eventMult;
}

export type Listing = { id: string; companyId: string; seg: SegmentId; appeal: number };

/** Tüm ilanların saatlik satış hızları. */
export function marketRates(listings: Listing[], eventMult: (seg: SegmentId) => number = () => 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seg of SEGMENT_IDS) {
    const ls = listings.filter((l) => l.seg === seg && l.appeal > 0);
    const sellers = new Set(ls.map((l) => l.companyId)).size;
    const sum = ls.reduce((s, l) => s + l.appeal, 0);
    const D = segmentDemand(seg, sellers, eventMult(seg));
    for (const l of ls) out[l.id] = (D * l.appeal) / (sum + OUTSIDE_APPEAL);
  }
  for (const l of listings) if (!(l.id in out)) out[l.id] = 0;
  return out;
}

/** "Bu fiyatı koysam ne kadar satarım?" tahmini: modelId verilirse o ilanın yerine geçer. */
export function estimateRate(
  listings: Listing[],
  me: { companyId: string; seg: SegmentId; appeal: number; replaceId?: string },
  eventMult = 1
): number {
  const others = listings.filter((l) => l.seg === me.seg && l.id !== me.replaceId);
  const rates = marketRates([...others, { id: "__me", companyId: me.companyId, seg: me.seg, appeal: me.appeal }], () => eventMult);
  return rates["__me"] ?? 0;
}

/** Pazar payı: kendi satış hızının segmentteki tüm satışlara (kurgusal rakipler dahil) oranı. */
export function marketShare(listings: Listing[], id: string): number {
  const l = listings.find((x) => x.id === id);
  if (!l || l.appeal <= 0) return 0;
  const sum = listings.filter((x) => x.seg === l.seg && x.appeal > 0).reduce((s, x) => s + x.appeal, 0);
  return l.appeal / (sum + OUTSIDE_APPEAL);
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
