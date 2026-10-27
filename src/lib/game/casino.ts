// Kulüp: masa oyunları, piyasa bahsi ve bahis bürosu kuralları. Hepsi oyun parasıyla.
// Kasa her oyunda biraz öndedir; bu, ekonomideki fazla parayı yavaşça emer.

export const MIN_BET = 100;
export const MAX_BET_RATIO = 0.1; // tek bahis en fazla şirket değerinin %10'u
export const MAX_BET_CAP = 5_000_000;

export function maxBet(companyValue: number): number {
  return Math.min(MAX_BET_CAP, Math.max(1_000, Math.floor(companyValue * MAX_BET_RATIO)));
}

// ---- Rulet (Avrupa: 0-36, kasa avantajı %2,7) ----
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type RouletteBet = "red" | "black" | "even" | "odd" | "low" | "high" | `n${number}`;
export const ROULETTE_LABEL: Record<string, string> = { red: "Kırmızı", black: "Siyah", even: "Çift", odd: "Tek", low: "1-18", high: "19-36" };

export function isRouletteBet(x: unknown): x is RouletteBet {
  if (typeof x !== "string") return false;
  if (x in ROULETTE_LABEL) return true;
  const m = /^n(\d{1,2})$/.exec(x);
  return !!m && Number(m[1]) <= 36;
}

/** Toplam geri ödeme çarpanı (bahis dahil); kaybederse 0. */
export function roulettePayout(bet: RouletteBet, n: number): number {
  if (bet.startsWith("n")) return Number(bet.slice(1)) === n ? 36 : 0;
  if (n === 0) return 0;
  const win =
    (bet === "red" && RED.has(n)) ||
    (bet === "black" && !RED.has(n)) ||
    (bet === "even" && n % 2 === 0) ||
    (bet === "odd" && n % 2 === 1) ||
    (bet === "low" && n <= 18) ||
    (bet === "high" && n >= 19);
  return win ? 2 : 0;
}

// ---- Zar (iki zar toplamı; 7 kasanındır, kasa avantajı ≈ %2-3) ----
export type DiceBet = "high" | "low" | "seven";
export const DICE_LABEL: Record<DiceBet, string> = { high: "8 ve üstü", low: "6 ve altı", seven: "Tam 7" };
export const DICE_PAYOUT: Record<DiceBet, number> = { high: 2.35, low: 2.35, seven: 5.8 };

export function dicePayout(bet: DiceBet, a: number, b: number): number {
  const s = a + b;
  if (bet === "seven") return s === 7 ? DICE_PAYOUT.seven : 0;
  if (bet === "high") return s >= 8 ? DICE_PAYOUT.high : 0;
  return s <= 6 ? DICE_PAYOUT.low : 0;
}

// ---- Blackjack (krupiye 17'de durur, blackjack 3:2) ----
export type Card = { r: number; s: number }; // r: 1-13 (1 = as), s: 0-3
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 1) aces++;
    total += c.r === 1 ? 1 : Math.min(10, c.r);
  }
  let soft = false;
  if (aces > 0 && total + 10 <= 21) {
    total += 10;
    soft = true;
  }
  return { total, soft };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

/** Elin sonucu: toplam geri ödeme çarpanı (bahis dahil, ikiye katlanmış bahis ayrıca hesaplanır). */
export function blackjackResult(player: Card[], dealer: Card[]): { mult: number; text: string } {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > 21) return { mult: 0, text: "Battın" };
  if (isBlackjack(player) && !isBlackjack(dealer)) return { mult: 2.5, text: "Blackjack!" };
  if (isBlackjack(dealer) && !isBlackjack(player)) return { mult: 0, text: "Krupiyede blackjack" };
  if (d > 21) return { mult: 2, text: "Krupiye battı, kazandın" };
  if (p > d) return { mult: 2, text: "Kazandın" };
  if (p < d) return { mult: 0, text: "Krupiye kazandı" };
  return { mult: 1, text: "Berabere, bahis iade" };
}

// ---- Piyasa bahsi ----
export const MARKET_HORIZONS = [15, 60]; // dakika
export const MARKET_EDGE = 0.95; // oran = 0,95 ÷ olasılık

export function oddsFor(p: number): number {
  const q = Math.max(0.1, Math.min(0.9, p));
  return Math.round((MARKET_EDGE / q) * 100) / 100;
}

// ---- Bahis bürosu ----
export const POOL_CUT = 0.05;
export const LEADER_HOUR_UTC = 18; // her gün 21:00 İstanbul
export const LEADER_CLOSE_HOURS = 12; // sonuçtan 12 saat önce kapanır

// ---- Kayıp haberleri ----
export const LOSS_NEWS_MIN = 20_000;
export const LOSS_NEWS_RATIO = 0.2; // 24 saatte şirket değerinin %20'si
export const LOSS_REP = 3;
export const LOSS_LOVE = 8;

// ---- Şans çarkı (32 dilim; kasa avantajı ≈ %4,7) ----
// Dilimler çarkın üzerindeki sırayla; büyük çarpanlar dağıtılmış. 0: boş.
export const SPIN_SEGMENTS: number[] = [
  0, 1.5, 0, 0.5, 0, 2, 0, 3, 0, 0.5, 0, 1.5, 0, 2, 0, 0.5,
  0, 0, 10, 0, 0.5, 0, 1.5, 0, 3, 0, 2, 0, 0.5, 0, 1.5, 0,
];

export function spinPayout(index: number): number {
  return SPIN_SEGMENTS[index] ?? 0;
}

/** Beklenen geri ödeme (bahis başına). */
export const SPIN_RTP = SPIN_SEGMENTS.reduce((s, m) => s + m, 0) / SPIN_SEGMENTS.length;
