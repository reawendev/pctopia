import { POST_ABOVE, RESALE, STATUS_BY_ID, STATUS_ITEMS } from "@/lib/game/finance";
import { formatMoney } from "@/lib/game/economy";
import { ROMANCE_FROM } from "@/lib/game/life";
import { isMissingTable, loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { loadRelations } from "@/lib/server/life";
import { postAbout } from "@/lib/server/social";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function snapshot(userId: string, extra: Record<string, unknown> = {}) {
  const state = await loadCompany(userId);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const { data, error } = await db().from("status_items").select("*").eq("company_id", state.company.id);
  if (error) {
    if (isMissingTable(error)) return { ready: false, ...extra };
    throw new HttpError(500, error.message);
  }
  const owned = new Map((data ?? []).map((r) => [r.item_id, r]));
  return {
    ready: true,
    items: STATUS_ITEMS.map((i) => ({ ...i, owned: owned.has(i.id), boughtAt: owned.get(i.id)?.bought_at ?? null, resale: Math.floor(Number(owned.get(i.id)?.price ?? i.price) * RESALE) })),
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return snapshot(user.id);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const item = STATUS_BY_ID[String(body.itemId ?? "")];
  if (!item) throw new HttpError(400, "Eşya geçersiz");
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  let message = "";

  if (body.action === "buy") {
    const { data: has } = await db().from("status_items").select("item_id").eq("company_id", c.id).eq("item_id", item.id);
    if (has && has.length > 0) throw new HttpError(409, "Bu zaten sende var");
    const { error } = await db().rpc("status_buy", { p_company: c.id, p_item: item.id, p_price: item.price });
    if (error) {
      if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Bunun için kasada ${formatMoney(item.price)} olmalı`);
      if (/duplicate|23505|unique/i.test(error.message + (error.code ?? ""))) throw new HttpError(409, "Bu zaten sende var");
      if (isMissingTable(error) || /status_buy/.test(error.message)) throw new HttpError(503, "Mülkler için veritabanında 007_finans.sql çalıştırılmalı");
      throw new HttpError(500, error.message);
    }
    if (item.rep) await db().rpc("adjust_reputation", { p_company: c.id, p_delta: item.rep });
    // Partnerin yakınlığı artar
    const partner = (await loadRelations(c.id)).find((r) => r.married || r.engaged || r.effective >= ROMANCE_FROM);
    if (partner) await db().from("relationships").update({ affection: Math.min(100, partner.effective + item.love) }).eq("company_id", c.id).eq("npc_id", partner.npc_id);
    if (item.price >= POST_ABOVE) await postAbout(c.id, "luxury", { company: c.name, founder: c.founder_name, item: item.name.toLocaleLowerCase("tr") });
    await logEvent(c.id, "status", `Satın alındı: ${item.name}, ${formatMoney(item.price)}.`, -item.price);
    message = `${item.name} artık senin.${item.rep ? ` İtibar +${item.rep}.` : ""}${partner ? " Partnerin çok mutlu." : ""}`;
  } else if (body.action === "sell") {
    const { data: row } = await db().from("status_items").select("price").eq("company_id", c.id).eq("item_id", item.id).maybeSingle();
    if (!row) throw new HttpError(404, "Bu eşya sende yok");
    const refund = Math.floor(Number(row.price) * RESALE);
    const { error } = await db().rpc("status_sell", { p_company: c.id, p_item: item.id, p_refund: refund });
    if (error) throw new HttpError(500, error.message);
    await logEvent(c.id, "status", `Satıldı: ${item.name}, ${formatMoney(refund)}.`, refund);
    message = `${item.name} ${formatMoney(refund)} karşılığında satıldı.`;
  } else throw new HttpError(400, "Bilinmeyen işlem");

  const fresh = (await loadCompany(user.id))!;
  return snapshot(user.id, { message, journal: await loadJournal(fresh.company.id), state: view(fresh.company, fresh.owned, fresh.holdings) });
});
