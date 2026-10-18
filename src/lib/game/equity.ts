// Oyuncu şirket hisseleri: ortak kurallar.

export const FOUNDER_SHARES = 1000;
export const CONTROL = 0.51; // kurucu bu oranın altına inemez
export const ISSUE_FEE = 0.05; // halka arzda aracı kurum payı
export const EQUITY_FEE = 0.01; // oyuncular arası alım-satım komisyonu
export const IPO_MIN_VALUE = 100_000; // halka arz için en düşük şirket değeri
export const IPO_MIN_SHARES = 50;

/** İtibar piyasanın şirkete bakışını değiştirir: 0 → ×0,75, 50 → ×1, 100 → ×1,25. */
export function sentiment(reputation: number): number {
  return 0.75 + Math.max(0, Math.min(100, reputation)) / 200;
}

/** Hisse fiyatı: şirketin (oyuncu hisseleri hariç) değeri × piyasa algısı ÷ toplam hisse. */
export function sharePrice(baseValue: number, reputation: number, totalShares: number): number {
  return Math.max(1, Math.round((Math.max(0, baseValue) * sentiment(reputation) * 100) / Math.max(1, totalShares)) / 100);
}

/** Kurucu %51'in altına düşmeden basılabilecek en fazla yeni hisse. */
export function maxIssue(founder: number, total: number): number {
  return Math.max(0, Math.floor(founder / CONTROL - total));
}

/** Basılan hisselerden kasaya giren (aracı payı düşülmüş). */
export function issueProceeds(shares: number, price: number): number {
  return Math.floor(shares * price * (1 - ISSUE_FEE));
}

export const equityBuyTotal = (shares: number, price: number) => Math.ceil(shares * price * (1 + EQUITY_FEE));
export const equitySellTotal = (shares: number, price: number) => Math.floor(shares * price * (1 - EQUITY_FEE));
