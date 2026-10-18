// Oyuncu şirket hisseleri — YALNIZCA SUNUCU.
//
// Hisse fiyatı, şirketin oyuncu hisseleri HARİÇ değerinden hesaplanır (döngüsel bağımlılık olmasın):
//   taban değer = nakit + ekipman + borsa portföyü + banka/mülk/tesis
//   fiyat       = taban × piyasa algısı(itibar) ÷ toplam hisse
//   şirket değeri = taban + elindeki oyuncu hisselerinin değeri
//   kurucunun payı = şirket değeri × kurucu hissesi ÷ toplam hisse  (sıralama bunu kullanır)

import { sharePrice } from "../game/equity";
import { companyNetWorth, facilityWorth, isMissingTable, loadAllAssets } from "./company";
import { snapshot } from "./market";
import { db, HttpError } from "./supabase";

export type EquityRow = {
  id: string;
  ownerId: string;
  name: string;
  founderName: string;
  logo: unknown;
  logoUrl: string | null;
  portraitUrl: string | null;
  character: unknown;
  createdAt: string;
  reputation: number;
  base: number;
  price: number;
  total: number;
  founder: number;
  held: number; // oyuncuların elindeki
  float: number; // piyasada serbest
  ipo: string | null;
  holdingsValue: number; // bu şirketin elindeki oyuncu hisselerinin değeri
  value: number; // şirket değeri
  ownerWorth: number; // kurucunun payına düşen
};

export type Holding = { holder: string; target: string; shares: number; cost_basis: number };

type Board = { at: number; rows: Map<string, EquityRow>; holdings: Holding[] };
let cache: Board | null = null;
const CACHE_MS = 10_000;

export function invalidateEquity() {
  cache = null;
}

export async function loadHoldings(): Promise<Holding[]> {
  const { data, error } = await db().from("player_holdings").select("*");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  return (data ?? []).map((h) => ({ ...h, shares: Number(h.shares), cost_basis: Number(h.cost_basis) }));
}

/** Bütün şirketler: taban değer, hisse fiyatı ve dağılım. Kısa süre önbellekli. */
export async function equityBoard(force = false): Promise<Board> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [{ data: companies, error }, assets, holdings] = await Promise.all([db().from("companies").select("*"), loadAllAssets(), loadHoldings()]);
  if (error) throw new HttpError(500, error.message);
  const prices = snapshot().prices;
  const rows = new Map<string, EquityRow>();
  for (const c of companies ?? []) {
    const a = assets.get(c.id) ?? { owned: {}, holdings: {}, extra: 0 };
    const base = companyNetWorth(c.cash, a.owned, a.holdings, prices, (a.extra ?? 0) + facilityWorth(c));
    const total = Number(c.shares_total ?? 1000);
    const founder = Number(c.founder_shares ?? 1000);
    const held = holdings.filter((h) => h.target === c.id).reduce((s, h) => s + h.shares, 0);
    const rep = (c.reputation as number | undefined) ?? 50;
    rows.set(c.id, {
      id: c.id,
      ownerId: c.owner_id,
      name: c.name,
      founderName: c.founder_name,
      logo: c.logo,
      logoUrl: c.logo_url ?? null,
      portraitUrl: c.portrait_url ?? null,
      character: c.character,
      createdAt: c.created_at,
      reputation: rep,
      base,
      price: sharePrice(base, rep, total),
      total,
      founder,
      held,
      float: Math.max(0, total - founder - held),
      ipo: c.ipo_at ?? null,
      holdingsValue: 0,
      value: base,
      ownerWorth: base,
    });
  }
  for (const h of holdings) {
    const holder = rows.get(h.holder);
    const target = rows.get(h.target);
    if (holder && target) holder.holdingsValue += Math.floor(h.shares * target.price);
  }
  for (const r of rows.values()) {
    r.value = r.base + r.holdingsValue;
    r.ownerWorth = Math.floor((r.value * r.founder) / r.total);
  }
  cache = { at: Date.now(), rows, holdings };
  return cache;
}

/** Bir şirketin elindeki oyuncu hisselerinin değeri (loadCompany için). */
export async function holdingsValueOf(companyId: string): Promise<number> {
  const b = await equityBoard();
  return b.rows.get(companyId)?.holdingsValue ?? 0;
}
