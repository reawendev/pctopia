import { formatMoney } from "@/lib/game/economy";
import {
  equityBuyTotal, equitySellTotal, FOUNDER_SHARES, IPO_MIN_SHARES, IPO_MIN_VALUE, issueProceeds, maxIssue,
} from "@/lib/game/equity";
import { formatPrice } from "@/lib/game/market";
import { loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { equityBoard, invalidateEquity } from "@/lib/server/equity";
import { postAbout } from "@/lib/server/social";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED = "Halka arz için veritabanında 011_halka_arz_operasyon.sql çalıştırılmalı";

async function snapshotFor(companyId: string, force = false) {
  const { rows, holdings } = await equityBoard(force);
  const me = rows.get(companyId);
  if (!me) throw new HttpError(404, "Önce şirket kurmalısın");
  const ready = (await db().from("player_holdings").select("holder").limit(1)).error === null;
  const mine = holdings.filter((h) => h.holder === companyId);
  const list = Array.from(rows.values())
    .filter((r) => r.ipo && r.id !== companyId)
    .sort((a, b) => b.value - a.value)
    .map((r) => {
      const h = mine.find((x) => x.target === r.id);
      return {
        id: r.id,
        name: r.name,
        founderName: r.founderName,
        logo: r.logo,
        logoUrl: r.logoUrl,
        reputation: r.reputation,
        price: r.price,
        total: r.total,
        founder: r.founder,
        held: r.held,
        float: r.float,
        value: r.value,
        myShares: h?.shares ?? 0,
        myBasis: h?.cost_basis ?? 0,
      };
    });
  const shareholders = holdings
    .filter((h) => h.target === companyId)
    .map((h) => ({ id: h.holder, name: rows.get(h.holder)?.name ?? "Kapanmış şirket", shares: h.shares }))
    .sort((a, b) => b.shares - a.shares);
  return {
    ready,
    me: {
      ipo: me.ipo,
      price: me.price,
      total: me.total,
      founder: me.founder,
      float: me.float,
      held: me.held,
      ownership: me.founder / me.total,
      value: me.value,
      ownerWorth: me.ownerWorth,
      maxIssue: maxIssue(me.founder, me.total),
      canIpo: !me.ipo && me.value >= IPO_MIN_VALUE,
      minValue: IPO_MIN_VALUE,
      minShares: IPO_MIN_SHARES,
      shareholders,
    },
    list,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  return snapshotFor(state.company.id);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  if (c.founder_shares === undefined) throw new HttpError(503, NEED);
  const shares = Math.trunc(Number(body.shares));
  if (!Number.isFinite(shares) || shares < 1 || shares > 1_000_000) throw new HttpError(400, "Adet geçersiz");
  const { rows } = await equityBoard(true);
  const me = rows.get(c.id)!;
  let message = "";

  const fail = (e: { message: string }, need?: number): never => {
    if (/Yetersiz nakit/.test(e.message)) throw new HttpError(400, need ? `Bunun için kasada ${formatMoney(need)} olmalı` : "Yeterli nakit yok");
    if (/Kontrol payı/.test(e.message)) throw new HttpError(400, "Kurucu payın %51'in altına düşemez");
    if (/yeterli hisse/.test(e.message)) throw new HttpError(409, "Piyasada bu kadar serbest hisse yok");
    if (/Elinde/.test(e.message)) throw new HttpError(400, "Elinde bu kadar hisse yok");
    if (/Halka açık değil/.test(e.message)) throw new HttpError(400, "Bu şirket halka açık değil");
    if (/equity_|player_holdings/.test(e.message)) throw new HttpError(503, NEED);
    throw new HttpError(500, e.message);
  };

  switch (body.action) {
    case "issue": {
      const first = !me.ipo;
      if (first && me.value < IPO_MIN_VALUE) throw new HttpError(400, `Halka arz için şirket değeri en az ${formatMoney(IPO_MIN_VALUE)} olmalı`);
      if (first && shares < IPO_MIN_SHARES) throw new HttpError(400, `Halka arzda en az ${IPO_MIN_SHARES} hisse basılmalı`);
      if (shares > maxIssue(me.founder, me.total)) throw new HttpError(400, `En fazla ${maxIssue(me.founder, me.total)} yeni hisse basabilirsin (kurucu payı %51'in altına inemez)`);
      const cash = issueProceeds(shares, me.price);
      const { error } = await db().rpc("equity_issue", { p_company: c.id, p_shares: shares, p_cash: cash });
      if (error) fail(error);
      const pct = Math.round((shares / (me.total + shares)) * 1000) / 10;
      await logEvent(c.id, "equity", `${first ? "Halka arz" : "Ek ihraç"}: ${shares} yeni hisse ${formatPrice(me.price)} fiyatla satıldı. Kasaya ${formatMoney(cash)} girdi.`, cash);
      if (first) await postAbout(c.id, "ipo", { company: c.name, price: formatPrice(me.price), pct: String(pct).replace(".", ",") });
      message = `${shares} hisse satıldı, kasaya ${formatMoney(cash)} girdi.`;
      break;
    }
    case "buyback": {
      if (!me.ipo) throw new HttpError(400, "Şirketin halka açık değil");
      const cost = equityBuyTotal(shares, me.price);
      if (me.total - shares < FOUNDER_SHARES) throw new HttpError(400, "Kurucu hisselerinden fazlası geri alınamaz");
      const { error } = await db().rpc("equity_buyback", { p_company: c.id, p_shares: shares, p_cost: cost });
      if (error) fail(error, cost);
      await logEvent(c.id, "equity", `Geri alım: piyasadan ${shares} hisse ${formatPrice(me.price)} fiyatla alınıp iptal edildi, ${formatMoney(cost)}.`, -cost);
      message = `${shares} hisse geri alındı.`;
      break;
    }
    case "buy":
    case "sell": {
      const t = rows.get(String(body.targetId ?? ""));
      if (!t) throw new HttpError(404, "Şirket bulunamadı");
      if (t.id === c.id) throw new HttpError(400, "Kendi hisseni buradan alıp satamazsın; geri alım kullan");
      const buy = body.action === "buy";
      const total = buy ? equityBuyTotal(shares, t.price) : equitySellTotal(shares, t.price);
      const { error } = await db().rpc("equity_trade", { p_holder: c.id, p_target: t.id, p_shares: shares, p_total: total, p_buy: buy });
      if (error) fail(error, total);
      await logEvent(c.id, "equity", `${t.name}: ${shares} hisse ${buy ? "alındı" : "satıldı"} (${formatPrice(t.price)}), toplam ${formatMoney(total)}.`, buy ? -total : total);
      if (buy) {
        const after = (await db().from("player_holdings").select("shares").eq("holder", c.id).eq("target", t.id).maybeSingle()).data?.shares ?? shares;
        const pct = after / t.total;
        const before = (after - shares) / t.total;
        for (const step of [0.05, 0.1, 0.25]) {
          if (before < step && pct >= step) {
            await logEvent(t.id, "equity", `${c.name}, şirketinin hisselerinin %${Math.round(step * 100)}'ini geçti.`);
            break;
          }
        }
      }
      message = `${shares} hisse ${buy ? "alındı" : "satıldı"}.`;
      break;
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }
  invalidateEquity();
  const fresh = (await loadCompany(user.id))!;
  return { ...(await snapshotFor(c.id, true)), message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(c.id) };
});
