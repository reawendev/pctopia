// Kulüp — YALNIZCA SUNUCU: masa oyunları, piyasa bahsi, bahis bürosu, kayıp haberleri.

import { randomInt } from "node:crypto";
import {
  blackjackResult, dicePayout, handValue, isBlackjack, LEADER_CLOSE_HOURS, LEADER_HOUR_UTC, LOSS_LOVE, LOSS_NEWS_MIN, LOSS_NEWS_RATIO,
  LOSS_REP, MARKET_HORIZONS, maxBet, MIN_BET, oddsFor, roulettePayout, SPIN_SEGMENTS, spinPayout, type Card, type DiceBet, type RouletteBet,
} from "../game/casino";
import { formatMoney } from "../game/economy";
import { STOCK_BY_ID, TICK_MS } from "../game/market";
import { ROMANCE_FROM } from "../game/life";
import { isMissingTable, logEvent } from "./company";
import { equityBoard } from "./equity";
import { loadRelations } from "./life";
import { currentTick, priceAt, upProbability } from "./market";
import { rankCompanies } from "./ranking";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";

const NEED = "Kulüp için veritabanında 012_kulup_bahis.sql çalıştırılmalı";

export type Player = { id: string; name: string; founder: string };

async function companyValue(id: string): Promise<number> {
  return (await equityBoard()).rows.get(id)?.value ?? 0;
}

async function checkBet(p: Player, bet: number): Promise<number> {
  const b = Math.trunc(bet);
  if (!Number.isFinite(b) || b < MIN_BET) throw new HttpError(400, `En düşük bahis ${formatMoney(MIN_BET)}`);
  const max = maxBet(await companyValue(p.id));
  if (b > max) throw new HttpError(400, `Tek bahis en fazla ${formatMoney(max)} olabilir (şirket değerinin %10'u)`);
  return b;
}

async function apply(companyId: string, bet: number, payout: number) {
  const { error } = await db().rpc("casino_apply", { p_company: companyId, p_bet: bet, p_payout: payout });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, "Kasada bu kadar nakit yok");
    if (/casino_apply/.test(error.message)) throw new HttpError(503, NEED);
    throw new HttpError(500, error.message);
  }
}

async function record(p: Player, game: string, bet: number, payout: number, detail: object) {
  await db().from("casino_log").insert({ company_id: p.id, game, bet, payout, detail });
  if (payout < bet) await lossNews(p);
  else if (payout - bet >= 50_000 && payout >= bet * 10) await postAbout(p.id, "gambling_win", { company: p.name, founder: p.founder, amount: formatMoney(payout - bet) });
}

/** Son 24 saatte büyük kayıp: magazin haberi, itibar kaybı ve küsen partner (günde bir kez). */
async function lossNews(p: Player) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db().from("casino_log").select("bet, payout, game").eq("company_id", p.id).gte("created_at", since);
  const net = (data ?? []).reduce((s, r) => s + Number(r.bet) - Number(r.payout), 0);
  const value = await companyValue(p.id);
  if (net < Math.max(LOSS_NEWS_MIN, value * LOSS_NEWS_RATIO)) return;
  if ((data ?? []).some((r) => r.game === "_news")) return; // bugün zaten haber oldu
  await db().from("casino_log").insert({ company_id: p.id, game: "_news", bet: 0, payout: 0, detail: { net } });
  await postAbout(p.id, "gambling_loss", { company: p.name, founder: p.founder, amount: formatMoney(net) });
  await db().rpc("adjust_reputation", { p_company: p.id, p_delta: -LOSS_REP });
  const partner = (await loadRelations(p.id)).find((r) => r.married || r.engaged || r.effective >= ROMANCE_FROM);
  if (partner) await db().from("relationships").update({ affection: Math.max(0, partner.effective - LOSS_LOVE) }).eq("company_id", p.id).eq("npc_id", partner.npc_id);
  await logEvent(p.id, "life", `Kulüpteki kayıpların (${formatMoney(net)}) magazine düştü. İtibar −${LOSS_REP}${partner ? ", partnerin sana kırgın" : ""}.`);
}

// ---------------- Masa oyunları ----------------

export async function playRoulette(p: Player, betRaw: number, choice: RouletteBet) {
  const bet = await checkBet(p, betRaw);
  const n = randomInt(0, 37);
  const payout = Math.floor(bet * roulettePayout(choice, n));
  await apply(p.id, bet, payout);
  await record(p, "rulet", bet, payout, { choice, n });
  return { n, payout, net: payout - bet };
}

export async function playSpin(p: Player, betRaw: number) {
  const bet = await checkBet(p, betRaw);
  const index = randomInt(0, SPIN_SEGMENTS.length);
  const mult = spinPayout(index);
  const payout = Math.floor(bet * mult);
  await apply(p.id, bet, payout);
  await record(p, "cark", bet, payout, { index, mult });
  return { index, mult, payout, net: payout - bet };
}

export async function playDice(p: Player, betRaw: number, choice: DiceBet) {
  const bet = await checkBet(p, betRaw);
  const a = randomInt(1, 7);
  const b = randomInt(1, 7);
  const payout = Math.floor(bet * dicePayout(choice, a, b));
  await apply(p.id, bet, payout);
  await record(p, "zar", bet, payout, { choice, a, b });
  return { dice: [a, b], payout, net: payout - bet };
}

// ---- Blackjack ----

type Hand = { company_id: string; bet: number; deck: Card[]; player: Card[]; dealer: Card[]; doubled: boolean; step?: number };

function shuffledDeck(): Card[] {
  const d: Card[] = [];
  for (let k = 0; k < 2; k++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** İstemciye: krupiyenin kapalı kartı el bitene kadar gizli. */
function handView(h: Hand, done: boolean) {
  return {
    bet: Number(h.bet) * (h.doubled ? 2 : 1),
    player: h.player,
    dealer: done ? h.dealer : [h.dealer[0]],
    playerTotal: handValue(h.player).total,
    dealerTotal: done ? handValue(h.dealer).total : handValue([h.dealer[0]]).total,
    canDouble: !done && h.player.length === 2 && !h.doubled,
  };
}

export async function loadHand(companyId: string) {
  const { data, error } = await db().from("blackjack_hands").select("*").eq("company_id", companyId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { ready: false as const };
    throw new HttpError(500, error.message);
  }
  return { ready: true as const, hand: data ? handView({ ...(data as Hand), bet: Number(data.bet) }, false) : null };
}

async function finishHand(p: Player, h: Hand) {
  // Krupiye 17'ye kadar çeker (oyuncu battıysa çekmez)
  if (handValue(h.player).total <= 21) while (handValue(h.dealer).total < 17) h.dealer.push(h.deck.pop()!);
  const res = blackjackResult(h.player, h.dealer);
  const stake = Number(h.bet) * (h.doubled ? 2 : 1);
  const payout = Math.floor(stake * res.mult);
  // Silme işlemi eli kilitler: ikinci istek ödeme alamaz
  const { data: del } = await db().from("blackjack_hands").delete().eq("company_id", p.id).select("company_id");
  if (!del?.length) throw new HttpError(409, "El zaten bitti");
  if (payout > 0) await apply(p.id, 0, payout);
  await record(p, "blackjack", stake, payout, { player: handValue(h.player).total, dealer: handValue(h.dealer).total });
  return { done: true, result: res.text, payout, net: payout - stake, hand: handView(h, true) };
}

export async function blackjack(p: Player, action: string, betRaw?: number) {
  const { data: cur } = await db().from("blackjack_hands").select("*").eq("company_id", p.id).maybeSingle();
  if (action === "deal") {
    if (cur) throw new HttpError(409, "Masada bitmemiş bir elin var");
    const bet = await checkBet(p, Number(betRaw));
    await apply(p.id, bet, 0);
    const deck = shuffledDeck();
    const h: Hand = { company_id: p.id, bet, deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], doubled: false, step: 0 };
    const { error } = await db().from("blackjack_hands").insert({ ...h });
    if (error) {
      await apply(p.id, 0, bet); // iade
      throw new HttpError(409, "Masada bitmemiş bir elin var");
    }
    if (isBlackjack(h.player) || isBlackjack(h.dealer)) return finishHand(p, h);
    return { done: false, hand: handView(h, false) };
  }
  if (!cur) throw new HttpError(404, "Masada elin yok");
  const h = { ...(cur as Hand), bet: Number(cur.bet) };
  if (action === "hit") {
    h.player.push(h.deck.pop()!);
    if (handValue(h.player).total >= 21) return finishHand(p, h);
    const step = Number(cur.step ?? 0);
    const { data: upd } = await db().from("blackjack_hands").update({ player: h.player, deck: h.deck, step: step + 1 }).eq("company_id", p.id).eq("step", step).select("company_id");
    if (!upd?.length) throw new HttpError(409, "El değişti, yenile");
    return { done: false, hand: handView(h, false) };
  }
  if (action === "double") {
    if (h.player.length !== 2 || h.doubled) throw new HttpError(400, "Yalnızca ilk iki kartta ikiye katlanır");
    await apply(p.id, h.bet, 0);
    h.doubled = true;
    h.player.push(h.deck.pop()!);
    return finishHand(p, h);
  }
  if (action === "stand") return finishHand(p, h);
  throw new HttpError(400, "Bilinmeyen hamle");
}

// ---------------- Piyasa bahsi ----------------

export function marketQuotes() {
  const tick = currentTick();
  return Object.keys(STOCK_BY_ID).map((id) => ({
    id,
    price: priceAt(id, tick),
    odds: MARKET_HORIZONS.map((m) => {
      const p = upProbability(id, tick, (m * 60_000) / TICK_MS);
      return { minutes: m, up: oddsFor(p), down: oddsFor(1 - p) };
    }),
  }));
}

export async function placeMarketBet(p: Player, stockId: string, dir: "up" | "down", minutes: number, betRaw: number) {
  if (!STOCK_BY_ID[stockId]) throw new HttpError(400, "Hisse geçersiz");
  if (!MARKET_HORIZONS.includes(minutes)) throw new HttpError(400, "Süre geçersiz");
  const bet = await checkBet(p, betRaw);
  const tick = currentTick();
  const prob = upProbability(stockId, tick, (minutes * 60_000) / TICK_MS);
  const odds = oddsFor(dir === "up" ? prob : 1 - prob);
  const price = priceAt(stockId, tick);
  await apply(p.id, bet, 0);
  const { error } = await db().from("market_bets").insert({
    company_id: p.id,
    stock_id: stockId,
    dir,
    bet,
    odds,
    start_price: price,
    settle_at: new Date((tick + (minutes * 60_000) / TICK_MS) * TICK_MS).toISOString(),
  });
  if (error) {
    await apply(p.id, 0, bet);
    throw new HttpError(500, error.message);
  }
  return { odds, price };
}

/** Süresi dolan piyasa bahislerini sonuçlandırır. */
export async function settleMarketBets(companyId?: string): Promise<boolean> {
  let q = db().from("market_bets").select("*").eq("status", "open").lte("settle_at", new Date().toISOString());
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return false;
    throw new HttpError(500, error.message);
  }
  let changed = false;
  for (const b of data ?? []) {
    const end = priceAt(b.stock_id, Math.floor(new Date(b.settle_at).getTime() / TICK_MS));
    const start = Number(b.start_price);
    const status = end === start ? "push" : (end > start) === (b.dir === "up") ? "won" : "lost";
    const payout = status === "push" ? Number(b.bet) : status === "won" ? Math.floor(Number(b.bet) * b.odds) : 0;
    const { data: upd } = await db().from("market_bets").update({ status, end_price: end, payout }).eq("id", b.id).eq("status", "open").select("id");
    if (!upd?.length) continue;
    changed = true;
    if (payout > 0) await apply(b.company_id, 0, payout);
    const { data: c } = await db().from("companies").select("name, founder_name").eq("id", b.company_id).maybeSingle();
    if (c) await record({ id: b.company_id, name: c.name, founder: c.founder_name }, "piyasa", Number(b.bet), payout, { stock: b.stock_id, status });
    const name = STOCK_BY_ID[b.stock_id]?.name ?? b.stock_id;
    await logEvent(
      b.company_id,
      "casino",
      status === "won" ? `Piyasa bahsi tuttu: ${name} ${b.dir === "up" ? "yükseldi" : "düştü"}, ${formatMoney(payout)} kazandın.` : status === "push" ? `Piyasa bahsi berabere: ${name} yerinde saydı, bahis iade.` : `Piyasa bahsi tutmadı: ${name}, ${formatMoney(Number(b.bet))} kaybettin.`,
      payout - (status === "push" ? Number(b.bet) : 0) || undefined
    );
  }
  return changed;
}

// ---------------- Bahis bürosu ----------------

const DAY = 86_400_000;

function leaderSlots(now: number) {
  const out: { id: string; resolves: number; closes: number }[] = [];
  const base = new Date(now);
  base.setUTCHours(LEADER_HOUR_UTC, 0, 0, 0);
  for (let k = 0; k < 3; k++) {
    const resolves = base.getTime() + k * DAY;
    if (resolves <= now) continue;
    const closes = resolves - LEADER_CLOSE_HOURS * 3_600_000;
    const day = new Date(resolves + 3 * 3_600_000).toISOString().slice(0, 10); // İstanbul günü
    out.push({ id: `leader:${day}`, resolves, closes });
  }
  return out;
}

const TR_DATE = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

/** Açık havuzları oluşturur, süresi gelenleri sonuçlandırır. */
export async function syncPools(): Promise<boolean> {
  const now = Date.now();
  const rows: Record<string, unknown>[] = leaderSlots(now).map((s) => ({
    id: s.id,
    kind: "leader",
    ref: null, // toplu eklemede bütün satırlar aynı sütunlara sahip olmalı
    title: `${TR_DATE(s.resolves)} 21:00'de sıralamada 1. kim olacak?`,
    closes_at: new Date(s.closes).toISOString(),
    resolves_at: new Date(s.resolves).toISOString(),
  }));
  const { data: tenders, error: tErr } = await db().from("tenders").select("id, buyer, title, closes_at").eq("status", "open");
  if (!tErr) {
    for (const t of tenders ?? []) {
      rows.push({ id: `tender:${t.id}`, kind: "tender", ref: t.id, title: `${t.buyer} ihalesini kim alacak?`, closes_at: t.closes_at, resolves_at: t.closes_at });
    }
  }
  const { error } = await db().from("bet_pools").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    if (isMissingTable(error)) return false;
    throw new HttpError(500, error.message);
  }

  const { data: due } = await db().from("bet_pools").select("*").eq("status", "open").lte("resolves_at", new Date(now).toISOString());
  let changed = false;
  for (const pool of due ?? []) {
    let winner: string | null = null;
    if (pool.kind === "leader") {
      winner = (await rankCompanies())[0]?.id ?? "none";
    } else {
      const { data: t } = await db().from("tenders").select("status, winner_company").eq("id", pool.ref).maybeSingle();
      if (!t) winner = "none";
      else if (t.status !== "settled") continue; // ihale henüz sonuçlanmadı
      else winner = t.winner_company ?? "rival";
    }
    const { data: r } = await db().rpc("pool_settle", { p_pool: pool.id, p_winner: winner });
    if (!r) continue;
    changed = true;
    const { data: bets } = await db().from("pool_bets").select("company_id, amount, payout").eq("pool_id", pool.id);
    const per = new Map<string, { amount: number; payout: number }>();
    for (const b of bets ?? []) {
      const v = per.get(b.company_id) ?? { amount: 0, payout: 0 };
      v.amount += Number(b.amount);
      v.payout += Number(b.payout ?? 0);
      per.set(b.company_id, v);
    }
    for (const [cid, v] of per) {
      const { data: c } = await db().from("companies").select("name, founder_name").eq("id", cid).maybeSingle();
      if (c) await record({ id: cid, name: c.name, founder: c.founder_name }, "buro", v.amount, v.payout, { pool: pool.id });
      await logEvent(cid, "casino", `Bahis bürosu, “${pool.title}”: ${v.payout > v.amount ? `${formatMoney(v.payout)} kazandın` : v.payout === v.amount ? "kimse bilemedi, bahis iade" : `${formatMoney(v.amount)} kaybettin`}.`, v.payout - v.amount || undefined);
    }
  }
  return changed;
}

export async function poolsView(companyId: string) {
  const { data: pools, error } = await db().from("bet_pools").select("*").order("resolves_at", { ascending: false }).limit(20);
  if (error) {
    if (isMissingTable(error)) return { ready: false as const };
    throw new HttpError(500, error.message);
  }
  const ids = (pools ?? []).map((p) => p.id);
  const { data: bets } = ids.length ? await db().from("pool_bets").select("pool_id, company_id, option, amount, payout").in("pool_id", ids) : { data: [] as any[] };
  const { rows } = await equityBoard();
  const name = (id: string) => (id === "rival" ? "Kurgusal rakip" : id === "none" ? "Kimse" : rows.get(id)?.name ?? "Kapanmış şirket");
  const now = Date.now();
  const companies = Array.from(rows.values()).map((r) => ({ id: r.id, name: r.name }));
  const view = (pools ?? []).map((p) => {
    const pb = (bets ?? []).filter((b) => b.pool_id === p.id);
    const total = pb.reduce((s, b) => s + Number(b.amount), 0);
    const by = new Map<string, number>();
    for (const b of pb) by.set(b.option, (by.get(b.option) ?? 0) + Number(b.amount));
    const optionIds = p.kind === "tender" ? [...companies.map((c) => c.id), "rival"] : companies.map((c) => c.id);
    const options = optionIds
      .map((id) => ({ id, name: name(id), amount: by.get(id) ?? 0, mult: by.get(id) ? Math.round(((total * 0.95) / by.get(id)!) * 100) / 100 : null }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "tr"));
    const mine = pb.filter((b) => b.company_id === companyId);
    return {
      id: p.id,
      kind: p.kind,
      title: p.title,
      closesAt: p.closes_at,
      resolvesAt: p.resolves_at,
      open: p.status === "open" && new Date(p.closes_at).getTime() > now,
      status: p.status,
      winner: p.winner ? name(p.winner) : null,
      total,
      options,
      mine: mine.map((b) => ({ option: name(b.option), amount: Number(b.amount), payout: b.payout === null ? null : Number(b.payout) })),
    };
  });
  return {
    ready: true as const,
    open: view.filter((p) => p.open).sort((a, b) => a.closesAt.localeCompare(b.closesAt)),
    waiting: view.filter((p) => !p.open && p.status === "open" && p.mine.length > 0),
    past: view.filter((p) => p.status === "settled" && p.mine.length > 0).slice(0, 6),
  };
}

export async function placePoolBet(p: Player, poolId: string, option: string, amountRaw: number) {
  const amount = await checkBet(p, amountRaw);
  const { data: pool } = await db().from("bet_pools").select("*").eq("id", poolId).maybeSingle();
  if (!pool) throw new HttpError(404, "Bahis bulunamadı");
  const { rows } = await equityBoard();
  const valid = option === "rival" ? pool.kind === "tender" : rows.has(option);
  if (!valid) throw new HttpError(400, "Seçenek geçersiz");
  const { error } = await db().rpc("pool_bet", { p_pool: poolId, p_company: p.id, p_option: option, p_amount: amount });
  if (error) {
    if (/kapandı/.test(error.message)) throw new HttpError(409, "Bu bahis kapandı");
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, "Kasada bu kadar nakit yok");
    throw new HttpError(500, error.message);
  }
  const optName = option === "rival" ? "kurgusal rakip" : rows.get(option)!.name;
  await logEvent(p.id, "casino", `Bahis bürosu: “${pool.title}” için ${optName} üzerine ${formatMoney(amount)} yatırıldı.`, -amount);
}

export async function clubSummary(companyId: string) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db().from("casino_log").select("bet, payout, game").eq("company_id", companyId).gte("created_at", since);
  const real = (data ?? []).filter((r) => r.game !== "_news");
  return { net24h: real.reduce((s, r) => s + Number(r.payout) - Number(r.bet), 0), maxBet: maxBet(await companyValue(companyId)) };
}
