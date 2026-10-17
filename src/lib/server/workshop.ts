// PC Atölyesi — sunucu tarafı: satış senkronu ve model görünümü.

import { formatMoney } from "../game/economy";
import type { Perk } from "../game/life";
import {
  fairValue, isBottlenecked, pendingSales, performanceScore, salesRate, segment, unitCost, verdict, type Parts,
} from "../game/workshop";
import { isMissingTable, logEvent } from "./company";
import { postAbout } from "./social";
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

/**
 * Satışta olan modellerin birikmiş satışlarını kasaya geçirir. Tükenme ve satış eşiklerinde
 * sosyal medya paylaşımı yapar. Değişiklik olduysa true döner.
 */
export async function syncSales(ctx: Ctx, models?: ModelRow[] | null): Promise<boolean> {
  const list = models ?? (await loadModels(ctx.id));
  if (!list) return false;
  const now = Date.now();
  let changed = false;

  for (const m of list) {
    if (!m.listed || m.stock <= 0) continue;
    const rate = salesRate({ parts: m.parts, price: m.price, reputation: ctx.reputation, stageLevel: ctx.stageLevel, demandBonus: ctx.perks.demand });
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
    const before = m.sold_total;
    const after = before + sold;
    const crossed = MILESTONES.filter((x) => before < x && after >= x).pop();
    const vars = { company: ctx.name, model: m.name, count: crossed ?? after };
    if (sold === m.stock) await postAbout(ctx.id, "soldout", vars, ctx.perks.press);
    else if (crossed) await postAbout(ctx.id, "milestone", vars, ctx.perks.press);
  }
  return changed;
}

export function modelView(m: ModelRow, ctx: Omit<Ctx, "id" | "name">) {
  const fair = fairValue(m.parts, ctx.reputation);
  const rate = salesRate({ parts: m.parts, price: m.price, reputation: ctx.reputation, stageLevel: ctx.stageLevel, demandBonus: ctx.perks.demand });
  return {
    id: m.id,
    name: m.name,
    parts: m.parts,
    price: m.price,
    stock: m.stock,
    soldTotal: m.sold_total,
    listed: m.listed,
    unitCost: unitCost(m.parts, ctx.perks.parts),
    score: performanceScore(m.parts),
    segment: segment(m.parts),
    bottleneck: isBottlenecked(m.parts),
    fair,
    verdict: verdict(m.price, fair),
    ratePerHour: m.listed && m.stock > 0 ? rate : 0,
  };
}

/** Fiyat değişiminde (ya da ilk satışa çıkışta) sosyal medya tepkisi. Model başına 30 dk'da bir. */
export async function reactToPrice(ctx: Ctx, m: ModelRow, firstListing: boolean): Promise<void> {
  if (m.last_post_at && Date.now() - new Date(m.last_post_at).getTime() < 30 * 60_000) return;
  const fair = fairValue(m.parts, ctx.reputation);
  const v = verdict(m.price, fair);
  const vars = { company: ctx.name, model: m.name, price: formatMoney(m.price), fair: formatMoney(fair), segment: segment(m.parts) };
  let posted = true;
  if (m.price < unitCost(m.parts, ctx.perks.parts)) await postAbout(ctx.id, "below_cost", vars, ctx.perks.press);
  else if (v === "fahiş") await postAbout(ctx.id, "price_fahis", vars, ctx.perks.press);
  else if (v === "pahalı") await postAbout(ctx.id, "price_pahali", vars, ctx.perks.press);
  else if (v === "uygun" || v === "kelepir") await postAbout(ctx.id, "price_uygun", vars, ctx.perks.press);
  else if (firstListing && isBottlenecked(m.parts)) await postAbout(ctx.id, "bottleneck", vars, ctx.perks.press);
  else posted = false;
  if (posted) await db().from("pc_models").update({ last_post_at: new Date().toISOString() }).eq("id", m.id);
}
