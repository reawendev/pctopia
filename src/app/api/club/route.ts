import { isRouletteBet, type DiceBet } from "@/lib/game/casino";
import { formatMoney } from "@/lib/game/economy";
import {
  blackjack, clubSummary, loadHand, marketQuotes, placeMarketBet, placePoolBet, playDice, playRoulette, poolsView, settleMarketBets, syncPools, type Player,
} from "@/lib/server/casino";
import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { invalidateEquity } from "@/lib/server/equity";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function snapshot(companyId: string) {
  const hand = await loadHand(companyId);
  if (!hand.ready) return { ready: false };
  const [pools, summary, { data: bets }] = await Promise.all([
    poolsView(companyId),
    clubSummary(companyId),
    db().from("market_bets").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    ready: true,
    summary,
    hand: hand.hand,
    quotes: marketQuotes(),
    marketBets: (bets ?? []).map((b) => ({
      id: b.id,
      stockId: b.stock_id,
      dir: b.dir,
      bet: Number(b.bet),
      odds: b.odds,
      startPrice: b.start_price,
      endPrice: b.end_price,
      settleAt: b.settle_at,
      status: b.status,
      payout: b.payout === null ? null : Number(b.payout),
    })),
    pools,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  await settleMarketBets(state.company.id);
  await syncPools();
  return snapshot(state.company.id);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  const p: Player = { id: c.id, name: c.name, founder: c.founder_name };
  let result: Record<string, unknown> = {};
  let message = "";

  switch (body.game) {
    case "roulette": {
      if (!isRouletteBet(body.choice)) throw new HttpError(400, "Bahis türü geçersiz");
      const r = await playRoulette(p, Number(body.bet), body.choice);
      result = r;
      message = r.net > 0 ? `Top ${r.n} numarada durdu. ${formatMoney(r.net)} kazandın.` : `Top ${r.n} numarada durdu. Kaybettin.`;
      break;
    }
    case "dice": {
      if (!["high", "low", "seven"].includes(body.choice)) throw new HttpError(400, "Bahis türü geçersiz");
      const r = await playDice(p, Number(body.bet), body.choice as DiceBet);
      result = r;
      message = `Zarlar ${r.dice[0]} ve ${r.dice[1]}. ${r.net > 0 ? `${formatMoney(r.net)} kazandın.` : "Kaybettin."}`;
      break;
    }
    case "blackjack": {
      const r = await blackjack(p, String(body.action ?? ""), Number(body.bet));
      result = r;
      if (r.done) message = `${(r as any).result}. ${(r as any).net > 0 ? `+${formatMoney((r as any).net)}` : (r as any).net < 0 ? `−${formatMoney(-(r as any).net)}` : ""}`.trim();
      break;
    }
    case "market": {
      const dir = body.dir === "down" ? "down" : "up";
      const r = await placeMarketBet(p, String(body.stockId ?? ""), dir, Number(body.minutes), Number(body.bet));
      result = r;
      message = `Bahis alındı: ${body.minutes} dakika sonra ${dir === "up" ? "yukarıda" : "aşağıda"}, oran ${r.odds.toLocaleString("tr-TR")}.`;
      break;
    }
    case "pool": {
      await placePoolBet(p, String(body.poolId ?? ""), String(body.option ?? ""), Number(body.amount));
      message = "Bahis bürosuna yatırıldı.";
      break;
    }
    default:
      throw new HttpError(400, "Bilinmeyen oyun");
  }
  invalidateEquity();
  const fresh = (await loadCompany(user.id))!;
  return { ...(await snapshot(c.id)), result, message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(c.id) };
});
