import { formatMoney } from "@/lib/game/economy";
import { fairValue, isValidParts, MAX_LIST_RATIO, MAX_MODELS, MAX_STOCK, unitCost } from "@/lib/game/workshop";
import { loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { gameContext } from "@/lib/server/context";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";
import { invalidateMarket, loadModels, reactToPrice, syncSales, workshopView, type ModelRow } from "@/lib/server/workshop";
import { currentEvent } from "@/lib/server/events";
import { partMultipliers } from "@/lib/game/events";

const mult = () => partMultipliers(currentEvent().effects);

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED_MIGRATION = "PC Atölyesi için veritabanında 005_atolye_sosyal_hayat.sql çalıştırılmalı";

async function listing(userId: string, extra: Record<string, unknown> = {}) {
  const g = await gameContext(userId);
  const models = await loadModels(g.company.id);
  if (!models) return { ready: false, models: [], market: [], mine: [], reputation: g.reputation, perks: g.perks, ...extra };
  return {
    ready: true,
    companyId: g.company.id,
    reputation: g.reputation,
    perks: g.perks,
    ...(await workshopView(g.ctx, models)),
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const g = await gameContext(user.id);
  await syncSales(g.ctx);
  return listing(user.id);
});

function validPrice(price: unknown, fair: number): number {
  const p = Math.round(Number(price));
  if (!Number.isFinite(p) || p < 1) throw new HttpError(400, "Fiyat geçersiz");
  if (p > fair * MAX_LIST_RATIO) throw new HttpError(400, `Bu fiyat etikete bile yazılamaz. En fazla ${formatMoney(Math.floor(fair * MAX_LIST_RATIO))} isteyebilirsin.`);
  return p;
}

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const g = await gameContext(user.id);
  const models = await loadModels(g.company.id);
  if (!models) throw new HttpError(503, NEED_MIGRATION);

  // Değişiklikten önce birikmiş satışları kapat
  if (await syncSales(g.ctx, models)) return POSTAfterSync(req, user.id, body);
  return apply(user.id, g, models, action, body);
});

// Satış senkronu kasayı/stoğu değiştirdiyse güncel veriyle tekrar başla
async function POSTAfterSync(_req: Request, userId: string, body: any) {
  const g = await gameContext(userId);
  const models = (await loadModels(g.company.id))!;
  return apply(userId, g, models, String(body.action ?? ""), body);
}

async function apply(userId: string, g: Awaited<ReturnType<typeof gameContext>>, models: ModelRow[], action: string, body: any) {
  const find = () => {
    const m = models.find((x) => x.id === String(body.modelId ?? ""));
    if (!m) throw new HttpError(404, "Model bulunamadı");
    return m;
  };
  let message = "";

  switch (action) {
    case "create": {
      if (models.length >= MAX_MODELS) throw new HttpError(400, `En fazla ${MAX_MODELS} model tasarlayabilirsin`);
      const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 30) throw new HttpError(400, "Model adı 2-30 karakter olmalı");
      if (models.some((m) => m.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) throw new HttpError(409, "Bu isimde bir modelin zaten var");
      if (!isValidParts(body.parts)) throw new HttpError(400, "Parça seçimi geçersiz");
      const fair = fairValue(body.parts, g.reputation, mult(), g.perks.premium);
      const price = validPrice(body.price ?? fair, fair);
      const { error } = await db().from("pc_models").insert({ company_id: g.company.id, name, parts: body.parts, price });
      if (error) throw new HttpError(500, error.message);
      await logEvent(g.company.id, "workshop", `Atölye yeni bir model tasarladı: “${name}”.`);
      message = `“${name}” tasarlandı. Üretip satışa çıkarabilirsin.`;
      break;
    }
    case "produce": {
      const m = find();
      const qty = Math.trunc(Number(body.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 100) throw new HttpError(400, "Tek seferde 1-100 adet üretebilirsin");
      if (m.stock + qty > MAX_STOCK) throw new HttpError(400, `Depo en fazla ${MAX_STOCK} adet alır`);
      const cost = unitCost(m.parts, g.perks.parts, mult()) * qty;
      const { error } = await db().rpc("produce_pc", { p_company: g.company.id, p_model: m.id, p_qty: qty, p_cost: cost });
      if (error) {
        if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Bu üretim için kasada ${formatMoney(cost)} olmalı`);
        if (/Stok/.test(error.message)) throw new HttpError(400, `Depo en fazla ${MAX_STOCK} adet alır`);
        throw new HttpError(500, error.message);
      }
      // Stok sıfırdan geldiyse satış saati şimdiden başlar (boş depoda biriken talep olmaz)
      if (m.stock === 0) await db().from("pc_models").update({ last_sale_at: new Date().toISOString(), sale_carry: 0 }).eq("id", m.id);
      await logEvent(g.company.id, "workshop", `${qty} adet “${m.name}” üretildi, ${formatMoney(cost)}.`, -cost);
      message = `${qty} adet üretildi.`;
      break;
    }
    case "price": {
      const m = find();
      const fair = fairValue(m.parts, g.reputation, mult(), g.perks.premium);
      const price = validPrice(body.price, fair);
      const listed = body.listed === undefined ? m.listed : !!body.listed;
      const patch: Record<string, unknown> = { price, listed };
      if (listed && !m.listed) Object.assign(patch, { last_sale_at: new Date().toISOString(), sale_carry: 0 });
      const { error } = await db().from("pc_models").update(patch).eq("id", m.id);
      if (error) throw new HttpError(500, error.message);
      const updated = { ...m, price, listed };
      if (listed && (price !== m.price || !m.listed)) await reactToPrice(g.ctx, updated, !m.listed && !m.last_post_at);
      if (listed && !m.listed) await logEvent(g.company.id, "workshop", `“${m.name}” ${formatMoney(price)} etiketiyle satışa çıktı.`);
      message = !listed ? "Satıştan çekildi." : !m.listed ? "Satışa çıktı." : "Fiyat güncellendi.";
      break;
    }
    case "delete": {
      const m = find();
      const { error } = await db().from("pc_models").delete().eq("id", m.id);
      if (error) throw new HttpError(500, error.message);
      message = `“${m.name}” kaldırıldı.`;
      break;
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }

  invalidateMarket();
  const fresh = await loadCompany(userId);
  const journal = await loadJournal(g.company.id);
  return listing(userId, { message, journal, state: view(fresh!.company, fresh!.owned, fresh!.holdings) });
}
