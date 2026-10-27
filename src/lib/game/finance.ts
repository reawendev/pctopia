// Finans: çalışanlar, banka, statü eşyaları ve oyuncular arası anlaşmalar. Saf kurallar.

// ---- Çalışanlar ----

export type Role = "muhasebeci" | "sekreter" | "satis" | "pr";

export const STAFF: Record<Role, { name: string; desc: string; base: number; pct: number }> = {
  muhasebeci: { name: "Muhasebeci", desc: "Tahsilatı senin yerine yapar; gelir 12 yerine 24 saat birikebilir.", base: 40, pct: 0.08 },
  sekreter: { name: "Sekreter", desc: "Süresi dolmak üzere olan teklifleri senin yerine en mantıklı seçenekle yanıtlar.", base: 30, pct: 0.04 },
  satis: { name: "Satış müdürü", desc: "PC modellerinin pazardaki çekiciliğini %15 artırır.", base: 60, pct: 0.06 },
  pr: { name: "Halkla ilişkiler uzmanı", desc: "Olumsuz haberlerin itibar etkisini yarıya indirir.", base: 40, pct: 0.04 },
};
export const ROLES: Role[] = ["muhasebeci", "sekreter", "satis", "pr"];

/** Bu gelire kadar maaş gelirle birlikte artar; sonrasında karekök eğrisiyle yavaşlar. */
export const SALARY_KNEE = 2_000;

/** Maaşın baz aldığı gelir: dirseğe kadar aynı, sonra K × √(gelir / K). $50 bin/saat gelirde $10 bin gibi davranır. */
export function salaryBase(incomePerHour: number): number {
  const inc = Math.max(0, incomePerHour);
  return inc <= SALARY_KNEE ? inc : SALARY_KNEE * Math.sqrt(inc / SALARY_KNEE);
}

/**
 * Saatlik maaş: sabit taban ya da (yavaşlayan) gelirin bir yüzdesi, hangisi büyükse.
 * Eskiden gelirin düz yüzdesiydi; büyük şirketlerde dört çalışan gelirin %22'sini yiyordu.
 */
export function salary(role: Role, incomePerHour: number): number {
  return Math.round(Math.max(STAFF[role].base, STAFF[role].pct * salaryBase(incomePerHour)));
}

export const ACCOUNTANT_CAP_HOURS = 24;
export const SALES_MANAGER_BONUS = 0.15;

// ---- Banka ----

export const LOAN_DAILY_RATE = 0.12; // günlük %12 basit faiz (mevduattan yüksek olmalı, yoksa kredi alıp yatırmak bedava para olur)
export const DEPOSIT_DAILY_RATE = 0.1; // günlük %10 basit faiz
export const LOAN_TERMS = [1, 2, 3]; // gün
export const LOAN_MIN_LIMIT = 2_000;
export const BAN_HOURS = 24; // temerrüt sonrası kredi yasağı

export function loanLimit(netWorthWithoutLoan: number): number {
  return Math.max(LOAN_MIN_LIMIT, Math.floor(0.5 * netWorthWithoutLoan));
}

const DAY = 86_400_000;

/** Bugüne kadarki borç (vadesine kadar faiz işler, vadeden sonra sabit). */
export function loanOwed(principal: number, rate: number, takenMs: number, dueMs: number, nowMs: number): number {
  if (principal <= 0) return 0;
  const days = Math.max(0, Math.min(nowMs, dueMs) - takenMs) / DAY;
  return Math.ceil(principal * (1 + rate * days));
}

/** Vadedeki toplam borç. */
export function loanAtMaturity(principal: number, rate: number, days: number): number {
  return Math.ceil(principal * (1 + rate * days));
}

export function depositValue(deposit: number, sinceMs: number, nowMs: number): number {
  if (deposit <= 0) return 0;
  return Math.floor(deposit * (1 + DEPOSIT_DAILY_RATE * (Math.max(0, nowMs - sinceMs) / DAY)));
}

// ---- Statü eşyaları ----

export type StatusItem = { id: string; group: "ev" | "araba" | "deniz" | "saat"; name: string; price: number; rep: number; love: number };

export const STATUS_ITEMS: StatusItem[] = [
  { id: "studyo", group: "ev", name: "Şehir merkezinde stüdyo daire", price: 8_000, rep: 1, love: 4 },
  { id: "villa", group: "ev", name: "Bahçeli villa", price: 250_000, rep: 3, love: 8 },
  { id: "yali", group: "ev", name: "Boğaz'da yalı", price: 5_000_000, rep: 6, love: 12 },
  { id: "sedan", group: "araba", name: "İkinci el sedan", price: 4_000, rep: 0, love: 2 },
  { id: "alman", group: "araba", name: "Alman lüks sedan", price: 60_000, rep: 2, love: 5 },
  { id: "spor", group: "araba", name: "İtalyan süper spor", price: 900_000, rep: 4, love: 8 },
  { id: "saat", group: "saat", name: "İsviçre saati", price: 15_000, rep: 1, love: 3 },
  { id: "saat2", group: "saat", name: "Sınırlı üretim saat", price: 200_000, rep: 2, love: 5 },
  { id: "tekne", group: "deniz", name: "Gezi teknesi", price: 300_000, rep: 3, love: 10 },
  { id: "yat", group: "deniz", name: "Mega yat", price: 12_000_000, rep: 6, love: 15 },
  { id: "jet", group: "deniz", name: "Özel jet", price: 40_000_000, rep: 8, love: 15 },
];
export const STATUS_BY_ID: Record<string, StatusItem> = Object.fromEntries(STATUS_ITEMS.map((s) => [s.id, s]));
export const STATUS_GROUP: Record<StatusItem["group"], string> = { ev: "Konut", araba: "Araç", deniz: "Deniz ve hava", saat: "Saat" };
export const RESALE = 0.7;
export const POST_ABOVE = 200_000; // bu fiyattan pahalı alımlar magazine düşer

// ---- Oyuncular arası anlaşmalar ----

export type DealKind = "wholesale" | "loan" | "revshare";
export const DEAL_LABEL: Record<DealKind, string> = { wholesale: "Toptan PC satışı", loan: "Borç", revshare: "Gelir ortaklığı" };
export const DEAL_TTL_HOURS = 24;
export const MAX_REVSHARE_TOTAL = 0.5; // bir şirketin gelirinin en fazla yarısı ortaklara bağlanabilir

export type WholesaleTerms = { modelId: string; modelName: string; parts: unknown; qty: number; unitPrice: number };
export type LoanTerms = { amount: number; interestPct: number; days: number };
export type RevshareTerms = { payment: number; sharePct: number; days: number };
