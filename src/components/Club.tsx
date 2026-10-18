"use client";

import { useCallback, useEffect, useState } from "react";
import { DICE_LABEL, DICE_PAYOUT, MIN_BET, RANKS, RED, ROULETTE_LABEL, SUITS, type Card } from "@/lib/game/casino";
import { formatMoney } from "@/lib/game/economy";
import { formatPrice, STOCK_BY_ID } from "@/lib/game/market";
import { apiFetch } from "@/lib/supabase/client";

type Hand = { bet: number; player: Card[]; dealer: Card[]; playerTotal: number; dealerTotal: number; canDouble: boolean };
type Quote = { id: string; price: number; odds: { minutes: number; up: number; down: number }[] };
type MarketBet = { id: number; stockId: string; dir: "up" | "down"; bet: number; odds: number; startPrice: number; endPrice: number | null; settleAt: string; status: string; payout: number | null };
type Pool = {
  id: string;
  kind: string;
  title: string;
  closesAt: string;
  resolvesAt: string;
  open: boolean;
  status: string;
  winner: string | null;
  total: number;
  options: { id: string; name: string; amount: number; mult: number | null }[];
  mine: { option: string; amount: number; payout: number | null }[];
};
type Data = {
  ready: boolean;
  summary: { net24h: number; maxBet: number };
  hand: Hand | null;
  quotes: Quote[];
  marketBets: MarketBet[];
  pools: { ready: boolean; open: Pool[]; waiting: Pool[]; past: Pool[] };
  result?: any;
  message?: string;
};

type Section = "masa" | "piyasa" | "buro";

function left(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

export function Club({ cash, now, onState, notify }: { cash: number; now: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState<Section>("masa");
  const [last, setLast] = useState<{ text: string; good: boolean | null } | null>(null);
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/club")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
    const t = setInterval(() => load().catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [load, notify]);

  const play = useCallback(
    async (body: object) => {
      setBusy(true);
      try {
        const r = await apiFetch<Data>("/api/club", { method: "POST", body: JSON.stringify(body) });
        setD(r);
        if ((r as any).state) onState({ ...(r as any).state, journal: (r as any).journal });
        if (r.message) setLast({ text: r.message, good: r.result?.net === undefined ? null : r.result.net > 0 ? true : r.result.net < 0 ? false : null });
        return r;
      } catch (e: any) {
        notify(e.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onState, notify]
  );

  if (!d) return <div className="card p-4 text-sm text-mute">Kulübün kapısı açılıyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Kulüp için veritabanında <code className="text-white">012_kulup_bahis.sql</code> çalıştırılmalı.</div>;

  return (
    <div className="space-y-3">
      <section className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="max-w-xl text-sm text-mute">
          Şehrin iş insanlarının gece buluştuğu kulüp. Oyun parasıyla oynanır ve kasa her zaman biraz öndedir. Bir günde şirket değerinin beşte birinden fazlasını kaybedenler magazine düşer, partnerleri de bundan hoşlanmaz.
        </p>
        <dl className="num shrink-0 text-right text-sm">
          <dt className="text-xs text-mute">Son 24 saat</dt>
          <dd className={d.summary.net24h > 0 ? "text-gain" : d.summary.net24h < 0 ? "text-loss" : ""}>
            {d.summary.net24h > 0 ? "+" : d.summary.net24h < 0 ? "−" : ""}
            {formatMoney(Math.abs(d.summary.net24h))}
          </dd>
          <dt className="mt-1 text-xs text-mute">Masa sınırı</dt>
          <dd>{formatMoney(d.summary.maxBet)}</dd>
        </dl>
      </section>

      <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-panel p-0.5 text-sm" role="tablist">
        {(
          [
            ["masa", "Masa oyunları"],
            ["piyasa", "Piyasa bahsi"],
            ["buro", "Bahis bürosu"],
          ] as [Section, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sec === k} onClick={() => setSec(k)} className={`shrink-0 whitespace-nowrap rounded px-3 py-1.5 ${sec === k ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {last && (
        <p className={`card px-4 py-2.5 text-sm ${last.good === true ? "border-gain/40 text-gain" : last.good === false ? "border-loss/40 text-loss" : "text-white"}`} role="status">
          {last.text}
        </p>
      )}

      {sec === "masa" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Roulette cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Dice cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <div className="lg:col-span-2">
            <Blackjack hand={d.hand} cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          </div>
        </div>
      )}
      {sec === "piyasa" && <MarketBets quotes={d.quotes} bets={d.marketBets} cash={cash} max={d.summary.maxBet} busy={busy} play={play} now={now} />}
      {sec === "buro" && <Pools pools={d.pools} cash={cash} max={d.summary.maxBet} busy={busy} play={play} now={now} />}
    </div>
  );
}

type Play = (b: object) => Promise<Data | null>;

function BetInput({ id, value, onChange, max }: { id: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <div className="w-32">
      <label className="label" htmlFor={id}>Bahis ($)</label>
      <input id={id} className="input num !py-2" inputMode="numeric" placeholder={`${MIN_BET}-${max}`} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    </div>
  );
}

const okBet = (b: number, cash: number, max: number) => b >= MIN_BET && b <= max && b <= cash;

// ---------------- Rulet ----------------

function Roulette({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [choice, setChoice] = useState("red");
  const [num, setNum] = useState("17");
  const [last, setLast] = useState<number | null>(null);
  const b = Number(bet) || 0;
  const c = choice === "number" ? `n${Math.min(36, Math.max(0, Number(num) || 0))}` : choice;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Rulet</h3>
        {last !== null && (
          <span className={`num flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${last === 0 ? "bg-gain/80 text-ink" : RED.has(last) ? "bg-loss text-white" : "bg-ink text-white ring-1 ring-line"}`} aria-label={`Son sayı ${last}`}>
            {last}
          </span>
        )}
      </div>
      <p className="text-xs text-mute">Renk, tek/çift ya da yarım: 2 katı. Tek sayı: 36 katı. Sıfır kasanındır.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...Object.entries(ROULETTE_LABEL), ["number", "Sayı"]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={choice === k} onClick={() => setChoice(k)} className={`rounded border px-2.5 py-1 text-sm ${choice === k ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <BetInput id="r-bet" value={bet} onChange={setBet} max={max} />
        {choice === "number" && (
          <div className="w-20">
            <label className="label" htmlFor="r-num">Sayı</label>
            <input id="r-num" className="input num !py-2" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={async () => { const r = await play({ game: "roulette", bet: b, choice: c }); if (r?.result) setLast(r.result.n); }}>
          Çevir
        </button>
      </div>
    </section>
  );
}

// ---------------- Zar ----------------

const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function Dice({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [choice, setChoice] = useState<"high" | "low" | "seven">("high");
  const [last, setLast] = useState<number[] | null>(null);
  const b = Number(bet) || 0;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Zar</h3>
        {last && <span className="text-3xl leading-none" aria-label={`Zarlar ${last[0]} ve ${last[1]}`}>{PIPS[last[0]]}{PIPS[last[1]]}</span>}
      </div>
      <p className="text-xs text-mute">İki zarın toplamı. 7 gelirse yüksek ve düşük kaybeder.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(DICE_LABEL) as (keyof typeof DICE_LABEL)[]).map((k) => (
          <button key={k} type="button" aria-pressed={choice === k} onClick={() => setChoice(k)} className={`rounded border px-2.5 py-1 text-sm ${choice === k ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}>
            {DICE_LABEL[k]} <span className="num text-xs text-mute">×{DICE_PAYOUT[k].toLocaleString("tr-TR")}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <BetInput id="d-bet" value={bet} onChange={setBet} max={max} />
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={async () => { const r = await play({ game: "dice", bet: b, choice }); if (r?.result) setLast(r.result.dice); }}>
          At
        </button>
      </div>
    </section>
  );
}

// ---------------- Blackjack ----------------

function CardFace({ c, hidden }: { c?: Card; hidden?: boolean }) {
  if (hidden || !c) return <span className="flex h-14 w-10 items-center justify-center rounded border border-line bg-raised text-mute" aria-label="Kapalı kart">✦</span>;
  const red = c.s === 1 || c.s === 2;
  return (
    <span className={`flex h-14 w-10 flex-col items-center justify-center rounded border border-white/70 bg-white font-semibold ${red ? "text-red-700" : "text-ink"}`} aria-label={`${RANKS[c.r]} ${SUITS[c.s]}`}>
      <span className="text-sm leading-none">{RANKS[c.r]}</span>
      <span className="text-base leading-none">{SUITS[c.s]}</span>
    </span>
  );
}

function Blackjack({ hand, cash, max, busy, play }: { hand: Hand | null; cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [shown, setShown] = useState<Hand | null>(null); // biten elin son hali
  const b = Number(bet) || 0;
  const h = hand ?? shown;
  const live = !!hand;
  return (
    <section className="card p-4">
      <h3 className="heading text-lg">Blackjack</h3>
      <p className="text-xs text-mute">21'e en yakın olan kazanır. Krupiye 17'de durur, blackjack 3'e 2 öder. İlk iki kartta bahsi ikiye katlayabilirsin.</p>
      {h && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-mute">Krupiye{!live ? `: ${h.dealerTotal}` : ""}</div>
            <div className="mt-1 flex gap-1.5">
              {h.dealer.map((c, i) => <CardFace key={i} c={c} />)}
              {live && <CardFace hidden />}
            </div>
          </div>
          <div>
            <div className="text-xs text-mute">
              Sen: <span className="num text-white">{h.playerTotal}</span>, bahis {formatMoney(h.bet)}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {h.player.map((c, i) => <CardFace key={i} c={c} />)}
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {live ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={async () => { const r = await play({ game: "blackjack", action: "hit" }); if (r?.result?.done) setShown(r.result.hand); }}>
              Kart çek
            </button>
            <button className="btn" disabled={busy} onClick={async () => { const r = await play({ game: "blackjack", action: "stand" }); if (r?.result?.done) setShown(r.result.hand); }}>
              Dur
            </button>
            {hand!.canDouble && (
              <button className="btn" disabled={busy || cash < hand!.bet} onClick={async () => { const r = await play({ game: "blackjack", action: "double" }); if (r?.result?.done) setShown(r.result.hand); }}>
                İkiye katla
              </button>
            )}
          </>
        ) : (
          <>
            <BetInput id="bj-bet" value={bet} onChange={setBet} max={max} />
            <button
              className="btn btn-primary"
              disabled={busy || !okBet(b, cash, max)}
              onClick={async () => {
                setShown(null);
                const r = await play({ game: "blackjack", action: "deal", bet: b });
                if (r?.result?.done) setShown(r.result.hand);
              }}
            >
              Kart dağıt
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------- Piyasa bahsi ----------------

function MarketBets({ quotes, bets, cash, max, busy, play, now }: { quotes: Quote[]; bets: MarketBet[]; cash: number; max: number; busy: boolean; play: Play; now: number }) {
  const [stock, setStock] = useState(quotes[0]?.id ?? "ANKA");
  const [minutes, setMinutes] = useState(60);
  const [bet, setBet] = useState("1000");
  const q = quotes.find((x) => x.id === stock) ?? quotes[0];
  const o = q?.odds.find((x) => x.minutes === minutes);
  const b = Number(bet) || 0;
  return (
    <div className="space-y-3">
      <section className="card p-4">
        <h3 className="heading text-lg">Yukarıda mı, aşağıda mı?</h3>
        <p className="text-xs text-mute">
          Seçtiğin hisse süre sonunda şimdikinden yüksekte mi alçakta mı olacak? Oranlar piyasanın o anki durumuna göre hesaplanır: bir çöküşten sonra "toparlanır" demek ucuz değildir. Fiyat aynı kalırsa bahis iade edilir.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[160px]">
            <label className="label" htmlFor="m-stock">Hisse</label>
            <select id="m-stock" className="input !py-2" value={stock} onChange={(e) => setStock(e.target.value)}>
              {quotes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}, {STOCK_BY_ID[x.id]?.name} ({formatPrice(x.price)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Süre</span>
            <div className="flex gap-1.5">
              {[15, 60].map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={`rounded border px-2.5 py-2 text-sm ${minutes === m ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}>
                  {m === 60 ? "1 saat" : `${m} dk`}
                </button>
              ))}
            </div>
          </div>
          <BetInput id="m-bet" value={bet} onChange={setBet} max={max} />
          <button className="btn btn-primary" disabled={busy || !o || !okBet(b, cash, max)} onClick={() => play({ game: "market", stockId: stock, dir: "up", minutes, bet: b })}>
            Yukarı <span className="num ml-1 text-xs">×{o?.up.toLocaleString("tr-TR")}</span>
          </button>
          <button className="btn" disabled={busy || !o || !okBet(b, cash, max)} onClick={() => play({ game: "market", stockId: stock, dir: "down", minutes, bet: b })}>
            Aşağı <span className="num ml-1 text-xs">×{o?.down.toLocaleString("tr-TR")}</span>
          </button>
        </div>
      </section>
      {bets.length > 0 && (
        <section className="card">
          <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Bahislerin</h3>
          <ul className="divide-y divide-line text-sm">
            {bets.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                <span>
                  {x.stockId} {x.dir === "up" ? "yukarı" : "aşağı"}, {formatMoney(x.bet)} × {x.odds.toLocaleString("tr-TR")}
                  <span className="num ml-2 text-xs text-mute">
                    {formatPrice(x.startPrice)}
                    {x.endPrice !== null ? ` → ${formatPrice(x.endPrice)}` : ""}
                  </span>
                </span>
                <span className={`num text-xs ${x.status === "won" ? "text-gain" : x.status === "lost" ? "text-loss" : "text-mute"}`}>
                  {x.status === "open" ? `${left(new Date(x.settleAt).getTime() - now)} kaldı` : x.status === "won" ? `+${formatMoney((x.payout ?? 0) - x.bet)}` : x.status === "push" ? "iade" : `−${formatMoney(x.bet)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------- Bahis bürosu ----------------

function Pools({ pools, cash, max, busy, play, now }: { pools: Data["pools"]; cash: number; max: number; busy: boolean; play: Play; now: number }) {
  if (!pools.ready) return <div className="card p-4 text-sm text-mute">Bahis bürosu kapalı.</div>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">Bahisler ortak havuzda toplanır. Sonuç belli olunca büro %5'ini alır, kalanı bilenler yatırdıkları oranda paylaşır. Kimse bilemezse herkese iade edilir.</p>
      {pools.open.length === 0 && <div className="card p-4 text-sm text-mute">Şu an açık bahis yok.</div>}
      {pools.open.map((p) => (
        <PoolCard key={p.id} p={p} cash={cash} max={max} busy={busy} play={play} now={now} />
      ))}
      {pools.waiting.length > 0 && (
        <section className="card">
          <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Sonuç bekleyenler</h3>
          <ul className="divide-y divide-line text-sm">
            {pools.waiting.map((p) => (
              <li key={p.id} className="px-4 py-2">
                {p.title} <span className="text-xs text-mute">({p.mine.map((m) => `${m.option}: ${formatMoney(m.amount)}`).join(", ")})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pools.past.length > 0 && (
        <section className="card">
          <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Sonuçlananlar</h3>
          <ul className="divide-y divide-line text-sm">
            {pools.past.map((p) => {
              const put = p.mine.reduce((s, m) => s + m.amount, 0);
              const got = p.mine.reduce((s, m) => s + (m.payout ?? 0), 0);
              return (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span>
                    {p.title} <span className="text-xs text-mute">Sonuç: {p.winner}</span>
                  </span>
                  <span className={`num text-xs ${got > put ? "text-gain" : got < put ? "text-loss" : "text-mute"}`}>{got > put ? `+${formatMoney(got - put)}` : got < put ? `−${formatMoney(put - got)}` : "iade"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function PoolCard({ p, cash, max, busy, play, now }: { p: Pool; cash: number; max: number; busy: boolean; play: Play; now: number }) {
  const [opt, setOpt] = useState(p.options[0]?.id ?? "");
  const [amt, setAmt] = useState("1000");
  const a = Number(amt) || 0;
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="heading text-lg">{p.title}</h3>
        <span className="num text-xs text-mute">
          Havuz {formatMoney(p.total)}, kapanışa {left(new Date(p.closesAt).getTime() - now)}
        </span>
      </div>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {p.options.map((o) => (
          <li key={o.id}>
            <button type="button" aria-pressed={opt === o.id} onClick={() => setOpt(o.id)} className={`flex w-full justify-between gap-2 rounded border px-3 py-1.5 text-left text-sm ${opt === o.id ? "border-amber bg-amber/10" : "border-line hover:border-white/40"}`}>
              <span className="truncate">{o.name}</span>
              <span className="num shrink-0 text-xs text-mute">{o.amount ? `${formatMoney(o.amount)}, ×${o.mult?.toLocaleString("tr-TR")}` : "henüz yok"}</span>
            </button>
          </li>
        ))}
      </ul>
      {p.mine.length > 0 && <p className="mt-2 text-xs text-white">Senin bahislerin: {p.mine.map((m) => `${m.option} ${formatMoney(m.amount)}`).join(", ")}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <BetInput id={`p-${p.id}`} value={amt} onChange={setAmt} max={max} />
        <button className="btn btn-primary" disabled={busy || !opt || !okBet(a, cash, max)} onClick={() => play({ game: "pool", poolId: p.id, option: opt, amount: a })}>
          Yatır
        </button>
      </div>
    </section>
  );
}
