import { COST_GROWTH, EQUIPMENT, EQUIPMENT_BY_ID, OFFLINE_CAP_HOURS, RESALE_RATIO } from "./config";

export type Owned = Record<string, number>;

/** `owned` adet varken bir sonraki birimin fiyatı. */
export function unitCost(equipmentId: string, owned: number): number {
  const eq = EQUIPMENT_BY_ID[equipmentId];
  if (!eq) throw new Error("Bilinmeyen ekipman");
  return Math.ceil(eq.baseCost * Math.pow(COST_GROWTH, owned));
}

export function incomePerHour(owned: Owned): number {
  let total = 0;
  for (const eq of EQUIPMENT) total += (owned[eq.id] ?? 0) * eq.incomePerHour;
  return total;
}

/** Son toplamadan beri biriken gelir (çevrimdışı üst sınırıyla). */
export function pendingIncome(owned: Owned, lastCollectedMs: number, nowMs: number, capHours = OFFLINE_CAP_HOURS): number {
  const hours = Math.max(0, (nowMs - lastCollectedMs) / 3_600_000);
  return Math.floor(incomePerHour(owned) * Math.min(hours, capHours));
}

/** Ekipmanın sıralamadaki değeri (satın alma maliyetlerinin bir oranı). */
export function assetValue(owned: Owned): number {
  let total = 0;
  for (const eq of EQUIPMENT) {
    const qty = owned[eq.id] ?? 0;
    for (let i = 0; i < qty; i++) total += unitCost(eq.id, i);
  }
  return Math.floor(total * RESALE_RATIO);
}

export function netWorth(cash: number, owned: Owned): number {
  return cash + assetValue(owned);
}

const UNITS: [number, string][] = [
  [1e12, "trilyon"],
  [1e9, "milyar"],
  [1e6, "milyon"],
  [1e3, "bin"],
];

/** 1.250.000 -> "1,25 milyon" ; kısa gösterim */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  for (const [v, s] of UNITS) {
    if (abs >= v) return (n / v).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " " + s;
  }
  return Math.floor(n).toLocaleString("tr-TR");
}

/** Kısa para gösterimi: "$1,25 milyon" */
export function formatCompactMoney(n: number): string {
  return (n < 0 ? "−$" : "$") + formatCompact(Math.abs(n));
}

export function formatMoney(n: number): string {
  return "$" + Math.floor(n).toLocaleString("tr-TR");
}
