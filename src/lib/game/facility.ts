// Tesis: garajdan kampüse. Depo, model sayısı, tek seferde üretim ve ölçek ekonomisi.
// Sınırlar 010_tesis_kriz.sql içindeki facility_max_* fonksiyonlarıyla aynı olmalı.

export type Facility = {
  level: number;
  name: string;
  scene: string;
  cost: number; // bu seviyeye geçiş bedeli
  hours: number; // inşaat süresi
  maxStock: number;
  maxModels: number;
  batch: number; // tek seferde üretim
  scale: number; // üretim maliyeti indirimi
};

export const FACILITIES: Facility[] = [
  { level: 1, name: "Garaj atölyesi", scene: "Bir tezgâh, bir lehim istasyonu, raflarda kutular.", cost: 0, hours: 0, maxStock: 500, maxModels: 5, batch: 100, scale: 0 },
  { level: 2, name: "Kiralık dükkân", scene: "Sanayi sitesinde vitrinli bir dükkân ve arkada küçük bir depo.", cost: 25_000, hours: 1, maxStock: 1_000, maxModels: 5, batch: 200, scale: 0 },
  { level: 3, name: "Ofis ve montaj katı", scene: "Bir iş merkezinde açık ofis; alt katta montaj bandı.", cost: 150_000, hours: 3, maxStock: 2_000, maxModels: 6, batch: 400, scale: 0.03 },
  { level: 4, name: "Montaj fabrikası", scene: "Organize sanayide kendi fabrikan: üç bant, test odası, yükleme rampası.", cost: 1_000_000, hours: 6, maxStock: 4_000, maxModels: 7, batch: 800, scale: 0.05 },
  { level: 5, name: "Plaza ve fabrika", scene: "Şehirde plaza katları, sanayide iki fabrika. Kendi lojistik filon var.", cost: 8_000_000, hours: 12, maxStock: 8_000, maxModels: 8, batch: 1_500, scale: 0.08 },
  { level: 6, name: "Teknoloji kampüsü", scene: "Ar-Ge binaları, otomatik üretim hatları ve kendi veri merkezin tek bir kampüste.", cost: 50_000_000, hours: 24, maxStock: 20_000, maxModels: 10, batch: 3_000, scale: 0.12 },
];

export const FACILITY_REP = 2; // her yükseltmede itibar
export const FACILITY_RESALE = 0.5; // net değere sayılan oran

export function facility(level: number): Facility {
  return FACILITIES[Math.max(1, Math.min(FACILITIES.length, level)) - 1];
}

/** Etkin seviye: inşaat bittiyse hedef seviye. */
export function effectiveLevel(level: number | null | undefined, target: number | null | undefined, readyAt: string | null | undefined, nowMs = Date.now()): number {
  const l = level ?? 1;
  if (target && readyAt && new Date(readyAt).getTime() <= nowMs) return target;
  return l;
}

/** Bu seviyeye kadar yapılan yatırımın toplamı. */
export function facilityInvested(level: number): number {
  return FACILITIES.filter((f) => f.level <= level).reduce((s, f) => s + f.cost, 0);
}
