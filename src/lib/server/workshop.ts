// PC Atölyesi — sunucu tarafı: ortak pazar, satış senkronu ve model görünümü.

import { demandMultiplier, partMultipliers, type SegmentId } from "../game/events";
import { formatMoney } from "../game/economy";
import { perksFrom, effectiveAffection, type Perk } from "../game/life";
import {
  appeal, fairValue, isBottlenecked, marketRates, marketShare, pendingSales, performanceScore, segment, segmentId, unitCost, verdict,
  type Listing, type Parts,
} from "../game/workshop";
import { isMissingTable, logEvent } from "./company";
import { currentEvent } from "./events";
import { postAbout } from "./social";
import { payShares } from "./finance";
import { SALES_MANAGER_BONUS } from "../game/finance";
import { techPerks } from "./research";
import { db, HttpError } from "./supabase";

export type ModelRow = {
  id: string;
  company_id: string;
  name: string;
  parts: Parts;
  price: number;
  stock: number;
  sold_total: number;
  sale_carry: number;
  last_sale_at: string;
  listed: boolean;
  last_post_at: string | null;
  created_at: string;
};

const MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000];

export async function loadModels(companyId: string): Promise<ModelRow[] | null> {
  const { data, error } = await db().from("pc_models").select("*").eq("company_id", companyId).order("created_at");
  if (error) {
    if (isMissingTable(error)) return null;
    throw new HttpError(500, error.message);
  }
  return ((data ?? []) as ModelRow[]).map((m) => ({ ...m, price: Number(m.price) }));
}

type Ctx = { id: string; name: string; reputation: number; stageLevel: number; perks: Record<Perk, number> };

/** Bir şirketin ekstra talep yararı (ilişkiler + ileride çalışanlar). */
export type DemandFn = (companyId: string) => number;

// ---- Ortak pazar ----

export type MarketListing = Listing & {
  modelId: string;
  name: string;
  companyName: string;
  logo: unknown;
  logoUrl: string | null;
  price: number;
  fair: number;
  stock: number;
  reputation: number;
};

type MarketCache = { at: number; listings: MarketListing[] };
let cache: MarketCache | null = null;
const CACHE_MS = 15_000;

/** Tüm şirketlerin satıştaki modelleri (stoklu olanlar) ve çekicilikleri. Kısa süre önbellekli. */
export async function loadMarket(force = false): Promise<MarketListing[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.listings;
  const { data: models, error } = await db().from("pc_models").select("*").eq("listed", true).gt("stock", 0);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  const rows = (models ?? []) as ModelRow[];
  const ids = Array.from(new Set(rows.map((m) => m.company_id)));
  const companies = new Map<string, any>();
  const demand = new Map<string, number>();
  const premium = new Map<string, number>();
  if (ids.length) {
    const tech = await techPerks(ids);
    for (const [id, t] of tech) premium.set(id, t.premium);
    const [{ data: cos }, { data: rels }, { data: managers }] = await Promise.all([
      db().from("companies").select("*").in("id", ids),
      db().from("relationships").select("*").in("company_id", ids),
      db().from("employees").select("company_id").eq("role", "satis").in("company_id", ids),
    ]);
    const hasManager = new Set((managers ?? []).map((m) => m.company_id));
    for (const c of cos ?? []) companies.set(c.id, c);
    const now = Date.now();
    for (const id of ids) {
      const mine = (rels ?? []).filter((r) => r.company_id === id);
      const perks = perksFrom(
        mine.map((r) => ({
          npcId: r.npc_id,
          affection: effectiveAffection(r.affection, new Date(r.last_activity_at).getTime(), now, r.engaged || r.married),
          engaged: r.engaged,
          married: r.married,
        }))
      );
      demand.set(id, perks.demand + (hasManager.has(id) ? SALES_MANAGER_BONUS : 0) + (tech.get(id)?.demand ?? 0));
    }
  }
  const mult = partMultipliers(currentEvent().effects);
  const listings: MarketListing[] = rows.map((m) => {
    const c = companies.get(m.company_id) ?? {};
    const rep = c.reputation ?? 50;
    const fair = fairValue(m.parts, rep, mult, premium.get(m.company_id) ?? 0);
    const price = Number(m.price);
    return {
      id: m.id,
      modelId: m.id,
      companyId: m.company_id,
      seg: segmentId(m.parts),
      appeal: appeal(price, fair, rep, demand.get(m.company_id) ?? 0),
      name: m.name,
      companyName: c.name ?? "",
      logo: c.logo ?? null,
      logoUrl: c.logo_url ?? null,
      price,
      fair,
      stock: m.stock,
      reputation: rep,
    };
  });
  cache = { at: Date.now(), listings };
  return listings;
}

export function invalidateMarket() {
  cache = null;
}

/** Pazardaki diğer şirketlerin ilanları + bu şirketin güncel ilanları. */
function mergeOwn(market: MarketListing[], ctx: Ctx, own: ModelRow[]): Listing[] {
  const mult = partMultipliers(currentEvent().effects);
  const others: Listing[] = market.filter((l) => l.companyId !== ctx.id);
  const mine: Listing[] = own
    .filter((m) => m.listed && m.stock > 0)
    .map((m) => ({ id: m.id, companyId: ctx.id, seg: segmentId(m.parts), appeal: appeal(m.price, fairValue(m.parts, ctx.reputation, mult, ctx.perks.premium), ctx.reputation, ctx.perks.demand) }));
  return [...others, ...mine];
}

const eventMult = (seg: SegmentId) => demandMultiplier(currentEvent().effects, seg);

/**
 * Satışta olan modellerin birikmiş satışlarını kasaya geçirir (ortak pazardaki paya göre).
 * Tükenme ve satış eşiklerinde sosyal medya paylaşımı yapar. Değişiklik olduysa true döner.
 */
export async function syncSales(ctx: Ctx, models?: ModelRow[] | null): Promise<boolean> {
  const list = models ?? (await loadModels(ctx.id));
  if (!list) return false;
  const selling = list.filter((m) => m.listed && m.stock > 0);
  if (selling.length === 0) return false;
  const now = Date.now();
  const rates = marketRates(mergeOwn(await loadMarket(), ctx, list), eventMult);
  let changed = false;

  for (const m of selling) {
    const rate = rates[m.id] ?? 0;
    const { sold, carry } = pendingSales({ rate, stock: m.stock, carry: m.sale_carry, lastSaleMs: new Date(m.last_sale_at).getTime(), nowMs: now });
    // Satış yoksa da birikimi ileri taşı (kesir korunur), ama her istekte yazmamak için en az 1 dk bekle
    if (sold === 0 && now - new Date(m.last_sale_at).getTime() < 60_000) continue;

    const revenue = sold * m.price;
    const { data: ok, error } = await db().rpc("settle_sales", {
      p_model: m.id,
      p_last: m.last_sale_at,
      p_now: new Date(now).toISOString(),
      p_sold: sold,
      p_revenue: revenue,
      p_carry: carry,
    });
    if (error) throw new HttpError(500, error.message);
    if (!ok || sold === 0) continue;

    changed = true;
    await logEvent(ctx.id, "sales", `${sold} adet “${m.name}” satıldı, ${formatMoney(revenue)}.`, revenue);
    await payShares(ctx.id, revenue, "PC satışı");
    const before = m.sold_total;
    const after = before + sold;
    const crossed = MILESTONES.filter((x) => before < x && after >= x).pop();
    const vars = { company: ctx.name, model: m.name, count: crossed ?? after };
    if (sold === m.stock) await postAbout(ctx.id, "soldout", vars, ctx.perks.press);
    else if (crossed) await postAbout(ctx.id, "milestone", vars, ctx.perks.press);
  }
  if (changed) invalidateMarket();
  return changed;
}

export async function workshopView(ctx: Ctx, own: ModelRow[]) {
  const market = await loadMarket();
  const listings = mergeOwn(market, ctx, own);
  const rates = marketRates(listings, eventMult);
  const ev = currentEvent();
  const mult = partMultipliers(ev.effects);
  const models = own.map((m) => {
    const fair = fairValue(m.parts, ctx.reputation, mult, ctx.perks.premium);
    const seg = segmentId(m.parts);
    const rivals = new Set(listings.filter((l) => l.seg === seg && l.companyId !== ctx.id && l.appeal > 0).map((l) => l.companyId)).size;
    return {
      id: m.id,
      name: m.name,
      parts: m.parts,
      price: m.price,
      stock: m.stock,
      soldTotal: m.sold_total,
      listed: m.listed,
      unitCost: unitCost(m.parts, ctx.perks.parts, mult),
      score: performanceScore(m.parts),
      seg,
      segment: segment(m.parts),
      bottleneck: isBottlenecked(m.parts),
      fair,
      verdict: verdict(m.price, fair),
      ratePerHour: rates[m.id] ?? 0,
      share: marketShare(listings, m.id),
      rivals,
    };
  });
  // İstemcinin "bu fiyatla ne satarım" tahmini için pazar ilanları (başka şirketlerinkiler isimleriyle)
  const board = market
    .filter((l) => l.companyId !== ctx.id)
    .map((l) => ({ id: l.id, companyId: l.companyId, seg: l.seg, appeal: l.appeal, name: l.name, companyName: l.companyName, logo: l.logo, logoUrl: l.logoUrl, price: l.price, fair: l.fair, rate: rates[l.id] ?? 0 }));
  return { models, market: board, mine: listings.filter((l) => l.companyId === ctx.id), event: { id: ev.id, demand: ev.effects.demand ?? {}, parts: mult } };
}

/** Fiyat değişiminde (ya da ilk satışa çıkışta) sosyal medya tepkisi. Model başına 30 dk'da bir. */
export async function reactToPrice(ctx: Ctx, m: ModelRow, firstListing: boolean): Promise<void> {
  if (m.last_post_at && Date.now() - new Date(m.last_post_at).getTime() < 30 * 60_000) return;
  const mult = partMultipliers(currentEvent().effects);
  const fair = fairValue(m.parts, ctx.reputation, mult, ctx.perks.premium);
  const v = verdict(m.price, fair);
  const vars = { company: ctx.name, model: m.name, price: formatMoney(m.price), fair: formatMoney(fair), segment: segment(m.parts) };
  let posted = true;
  if (m.price < unitCost(m.parts, ctx.perks.parts, mult)) await postAbout(ctx.id, "below_cost", vars, ctx.perks.press);
  else if (v === "fahiş") await postAbout(ctx.id, "price_fahis", vars, ctx.perks.press);
  else if (v === "pahalı") await postAbout(ctx.id, "price_pahali", vars, ctx.perks.press);
  else if (v === "uygun" || v === "kelepir") await postAbout(ctx.id, "price_uygun", vars, ctx.perks.press);
  else if (firstListing && isBottlenecked(m.parts)) await postAbout(ctx.id, "bottleneck", vars, ctx.perks.press);
  else posted = false;
  if (posted) await db().from("pc_models").update({ last_post_at: new Date().toISOString() }).eq("id", m.id);
}
