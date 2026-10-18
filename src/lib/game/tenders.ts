// İhaleler: ortak kurallar. Şartname üretimi ve rakip teklifi gizli tohumla sunucuda yapılır.

import { QUALITIES, SLOTS, type Parts, type Quality } from "./workshop";

export const TENDER_SLOT_MS = 2 * 3_600_000; // her 2 saatte bir yeni ihale
export const TENDER_OPEN_MS = 4 * 3_600_000; // teklifler 4 saat açık (aynı anda iki ihale)
export const TENDER_EPOCH = Date.UTC(2026, 9, 18, 9, 0, 0); // ilk ihale: 18 Ekim 12:00, İstanbul
export const BOND_RATE = 0.05; // teklif teminatı: toplam tutarın %5'i
export const WIN_REP = 3;
export const FAIL_REP = 6;

/** Puan: düşük olan kazanır. İtibar 100 → fiyatın %80'i, itibar 0 → %120'si sayılır. */
export function tenderScore(unitPrice: number, reputation: number): number {
  return unitPrice * (1.2 - Math.max(0, Math.min(100, reputation)) / 250);
}

export function bondFor(qty: number, unitPrice: number): number {
  return Math.ceil(qty * unitPrice * BOND_RATE);
}

const RANK: Record<Quality, number> = { low: 0, mid: 1, high: 2 };

export function meetsSpec(parts: Parts, spec: Parts): boolean {
  return SLOTS.every((k) => RANK[parts[k]] >= RANK[spec[k]]);
}

export function isQuality(x: unknown): x is Quality {
  return QUALITIES.includes(x as Quality);
}
