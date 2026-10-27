// Gizli operasyonlar: rakibe karşı karalama, casusluk ve sabotaj.

export type OpId = "smear" | "reviews" | "spy" | "tender" | "poach" | "dig";

export type Op = {
  id: OpId;
  name: string;
  desc: string;
  costFactor: number;
  p: number; // başarı olasılığı
  caught: number; // yakalanma olasılığı (başarıdan bağımsız)
  result: string; // başarıda ne olur
};

export const OPS: Op[] = [
  { id: "smear", name: "Karalama kampanyası", desc: "Basına rakip hakkında olumsuz bir dosya sızdır.", costFactor: 1, p: 0.6, caught: 0.3, result: "rakibin itibarı düşer, 6 saat PC talebi %15 azalır" },
  { id: "reviews", name: "Sahte yorum dalgası", desc: "Rakibin ürünlerine kötü yorum yağdır.", costFactor: 0.6, p: 0.7, caught: 0.25, result: "rakibin PC talebi 4 saat %30 düşer" },
  { id: "spy", name: "Endüstriyel casusluk", desc: "Rakibin Ar-Ge dosyalarını kopyala.", costFactor: 2, p: 0.45, caught: 0.4, result: "rakibin bitirdiği, sende olmayan bir Ar-Ge projesi senin olur" },
  { id: "tender", name: "İhale zarfını ele geçir", desc: "Rakibin açık bir ihaledeki teklifini öğren.", costFactor: 0.8, p: 0.55, caught: 0.3, result: "rakibin ihale teklifini görürsün" },
  { id: "poach", name: "Yönetici ayartma", desc: "Rakibin bir çalışanına daha iyi bir teklif yap.", costFactor: 1.2, p: 0.5, caught: 0.2, result: "rakibin bir çalışanı istifa eder" },
  { id: "dig", name: "Özel dedektif tut", desc: "Rakibin örtbas ettiği işleri ve kirli operasyonlarını araştır.", costFactor: 0.9, p: 0.6, caught: 0.15, result: "rakibin gizli bir skandalı varsa dosyası senin olur; elinde koz olur" },
];

/** Yakalanmadan başarılan operasyon, saldırganın sırrı olarak kalır (dedektif hariç). */
export const OP_SECRET: Partial<Record<OpId, "op_smear" | "op_reviews" | "op_spy" | "op_tender" | "op_poach">> = {
  smear: "op_smear",
  reviews: "op_reviews",
  spy: "op_spy",
  tender: "op_tender",
  poach: "op_poach",
};

/** Casusluk başarılıysa rakibin bir sırrını da bulma olasılığı. */
export const SPY_DOSSIER_CHANCE = 0.3;

export const OP_BY_ID: Record<string, Op> = Object.fromEntries(OPS.map((o) => [o.id, o]));

export const OP_WINDOW_HOURS = 6;
export const OPS_PER_WINDOW = 3; // saldırgan başına
export const HITS_PER_TARGET = 2; // hedef başına, herkesten toplam başarılı operasyon
export const CAUGHT_REP = 8;

/** Bedel rakibin büyüklüğüne göre: değerinin %0,4'ü, en az $3.000. */
export function opCost(op: Op, targetValue: number): number {
  return Math.round((Math.max(3_000, targetValue * 0.004) * op.costFactor) / 100) * 100;
}
