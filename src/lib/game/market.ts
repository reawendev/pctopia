// Borsa tanımları. Sunucu ve istemci ortak kullanır.
// Fiyat modeli ve gizli tohum yalnızca src/lib/server/market.ts içindedir.

export const TICK_MS = 20_000; // fiyatlar 20 saniyede bir değişir
export const TICKS_PER_DAY = (24 * 60 * 60_000) / TICK_MS; // 4320
export const TRADE_FEE = 0.005; // %0,5 komisyon (alışta ve satışta)

export type Risk = "low" | "mid" | "high";

export type Stock = {
  id: string; // borsa kodu
  name: string;
  sector: string;
  risk: Risk;
  basePrice: number;
  desc: string;
};

export const STOCKS: Stock[] = [
  { id: "ANKA", name: "Anka Otomotiv", sector: "Otomotiv", risk: "mid", basePrice: 120, desc: "Binek ve ticari araç üreticisi. Elektrikli araç dönüşümünün ortasında." },
  { id: "KLKN", name: "Kalkan Savunma", sector: "Savunma Sanayii", risk: "low", basePrice: 340, desc: "Uzun vadeli devlet sözleşmeleri, istikrarlı nakit akışı." },
  { id: "MVTR", name: "Mavi Tersane", sector: "Denizcilik", risk: "mid", basePrice: 85, desc: "Ticari gemi ve yat inşası. Siparişler dalgalı." },
  { id: "GKBR", name: "Gökbörü Havacılık", sector: "Havacılık", risk: "high", basePrice: 210, desc: "İnsansız hava aracı ve bölgesel uçak programları." },
  { id: "ATLS", name: "Atlas Enerji", sector: "Enerji", risk: "low", basePrice: 64, desc: "Rüzgâr ve güneş santralleri işletmecisi." },
  { id: "SLKN", name: "Silikon Yarı İletken", sector: "Yarı İletken", risk: "high", basePrice: 480, desc: "Çip tasarımı ve üretimi. Teknoloji döngüsüne çok duyarlı." },
  { id: "KRVN", name: "Kervan Lojistik", sector: "Lojistik", risk: "mid", basePrice: 42, desc: "Kara, deniz ve hava kargo ağı." },
  { id: "NBZT", name: "Nabız Telekom", sector: "Telekom", risk: "low", basePrice: 150, desc: "Mobil ve fiber altyapı. Düzenli ama yavaş büyüme." },
];

export const STOCK_BY_ID: Record<string, Stock> = Object.fromEntries(STOCKS.map((s) => [s.id, s]));

export const RISK_LABEL: Record<Risk, string> = { low: "Düşük risk", mid: "Orta risk", high: "Yüksek risk" };

export type Holding = { shares: number; costBasis: number };
export type Holdings = Record<string, Holding>;

/** Alışta ödenecek toplam (komisyon dahil). */
export function buyTotal(shares: number, price: number): number {
  return Math.ceil(shares * price * (1 + TRADE_FEE));
}

/** Satışta eline geçecek tutar (komisyon düşülmüş). */
export function sellTotal(shares: number, price: number): number {
  return Math.floor(shares * price * (1 - TRADE_FEE));
}

/** Nakitle en fazla kaç hisse alınabilir. */
export function maxAffordable(cash: number, price: number): number {
  if (price <= 0) return 0;
  let n = Math.floor(cash / (price * (1 + TRADE_FEE)));
  while (n > 0 && buyTotal(n, price) > cash) n--;
  return n;
}

export function portfolioValue(holdings: Holdings, prices: Record<string, number>): number {
  let total = 0;
  for (const [id, h] of Object.entries(holdings)) total += h.shares * (prices[id] ?? 0);
  return Math.floor(total);
}

export function formatPrice(p: number): string {
  return "$" + p.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(x: number): string {
  const s = (x * 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (x > 0 ? "+" : "") + s + "%";
}
