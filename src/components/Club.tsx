"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DICE_LABEL, DICE_PAYOUT, MIN_BET, RANKS, RED, ROULETTE_LABEL, PLINKO_LABEL, plinkoRtp, SLOT_RTP, SLOT_THREE, type PlinkoRisk, SLOT_TWO_CHERRIES, SLOT_TWO_SEVENS, SPIN_RTP, SPIN_SEGMENTS, SUITS, type Card, type SlotSymbol } from "@/lib/game/casino";
import { formatMoney } from "@/lib/game/economy";
import { formatPrice, STOCK_BY_ID } from "@/lib/game/market";
import { apiFetch } from "@/lib/supabase/client";
import { SkeletonCard } from "./Skeleton";
import { RouletteWheel } from "./RouletteWheel";
import { SpinWheel, label as spinLabel } from "./SpinWheel";
import { Dice3D, DICE_MS } from "./Dice3D";
import { SlotMachine, Symbol as SlotIcon } from "./SlotMachine";
import { BlackjackTable, tableSettleMs, type BjOutcome } from "./BlackjackTable";
import { PlinkoBoard } from "./PlinkoBoard";

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

  // before: sonuç ekrana yansımadan önce beklenecek iş (ör. rulet topu cebe oturana kadar)
  const play = useCallback(
    async (body: object, before?: (r: Data) => Promise<void>) => {
      setBusy(true);
      try {
        const r = await apiFetch<Data>("/api/club", { method: "POST", body: JSON.stringify(body) });
        if (before) {
          setLast(null);
          await before(r);
        }
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

  if (!d) return <SkeletonCard label="Kulübün kapısı açılıyor…" />;
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
        <p key={last.text + String(last.good)} className={`result-pop card px-4 py-2.5 text-sm ${last.good === true ? "border-gain/40 text-gain" : last.good === false ? "border-loss/40 text-loss" : "text-white"}`} role="status">
          {last.text}
        </p>
      )}

      {sec === "masa" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Roulette cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Spin cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Slot cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Plinko cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Blackjack hand={d.hand} cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
          <Dice cash={cash} max={d.summary.maxBet} busy={busy} play={play} />
        </div>
      )}
      {sec === "piyasa" && <MarketBets quotes={d.quotes} bets={d.marketBets} cash={cash} max={d.summary.maxBet} busy={busy} play={play} now={now} />}
      {sec === "buro" && <Pools pools={d.pools} cash={cash} max={d.summary.maxBet} busy={busy} play={play} now={now} />}
    </div>
  );
}

type Play = (b: object, before?: (r: Data) => Promise<void>) => Promise<Data | null>;

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
  const [spin, setSpin] = useState<{ id: number; n: number } | null>(null);
  const landed = useRef<(() => void) | null>(null);
  // Dönüş sırasında başka bölüme geçilirse sonucu bekletme
  useEffect(() => () => landed.current?.(), []);
  const b = Number(bet) || 0;
  const c = choice === "number" ? `n${Math.min(36, Math.max(0, Number(num) || 0))}` : choice;

  async function go() {
    await play({ game: "roulette", bet: b, choice: c }, (r) =>
      new Promise<void>((resolve) => {
        const n = r.result?.n;
        if (typeof n !== "number") return resolve();
        landed.current = () => {
          setLast(n);
          resolve();
        };
        setSpin({ id: Date.now(), n });
      })
    );
  }

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
      <div className="my-3 flex justify-center">
        <RouletteWheel spin={spin} onDone={() => { landed.current?.(); landed.current = null; }} size={232} />
      </div>
      <div className="flex flex-wrap gap-1.5">
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
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={go}>
          {spin && busy ? "Dönüyor…" : "Çevir"}
        </button>
      </div>
    </section>
  );
}

// ---------------- Plinko ----------------

function Plinko({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [risk, setRisk] = useState<PlinkoRisk>("low");
  const [drop, setDrop] = useState<{ id: number; path: number[]; bin: number } | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const landed = useRef<(() => void) | null>(null);
  useEffect(() => () => landed.current?.(), []);
  const b = Number(bet) || 0;
  const dropping = !!landed.current;

  async function go() {
    setLast(null);
    await play({ game: "plinko", bet: b, risk }, (r) =>
      new Promise<void>((resolve) => {
        const path = r.result?.path;
        if (!Array.isArray(path)) return resolve();
        landed.current = () => {
          setLast(r.result.mult);
          resolve();
        };
        setDrop({ id: Date.now(), path, bin: r.result.bin });
      })
    );
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Plinko</h3>
        {last !== null && <span className={`num result-pop text-sm font-semibold ${last > 1 ? "text-gain" : last === 1 ? "text-white" : "text-loss"}`}>×{last.toLocaleString("tr-TR")}</span>}
      </div>
      <p className="text-xs text-mute">
        Topu bırak, çivilere çarpa çarpa bir kutuya düşsün. Kenarlar çok öder ama oraya düşmek zordur. Riskli modda kenarlar ×155'e kadar çıkar, ortası daha çok yakar. Uzun vadede bahsin %{Math.round(plinkoRtp(risk) * 1000) / 10}'i geri döner.
      </p>
      <div className="my-3">
        <PlinkoBoard drop={drop} risk={risk} onDone={() => { landed.current?.(); landed.current = null; }} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <span className="label">Mod</span>
          <div className="flex gap-1.5">
            {(Object.keys(PLINKO_LABEL) as PlinkoRisk[]).map((k) => (
              <button key={k} type="button" aria-pressed={risk === k} disabled={busy} onClick={() => setRisk(k)} className={`rounded border px-2.5 py-2 text-sm ${risk === k ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}>
                {PLINKO_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <BetInput id="pk-bet" value={bet} onChange={setBet} max={max} />
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={go}>
          {dropping && busy ? "Düşüyor…" : "Bırak"}
        </button>
      </div>
    </section>
  );
}

// ---------------- Slot makinesi ----------------

function Slot({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [spin, setSpin] = useState<{ id: number; reels: SlotSymbol[] } | null>(null);
  const [win, setWin] = useState<number | null>(null);
  const landed = useRef<(() => void) | null>(null);
  useEffect(() => () => landed.current?.(), []);
  const b = Number(bet) || 0;
  const can = !busy && okBet(b, cash, max);

  async function go() {
    if (!can) return;
    setWin(null);
    await play({ game: "slot", bet: b }, (r) =>
      new Promise<void>((resolve) => {
        const reels = r.result?.reels;
        if (!Array.isArray(reels)) return resolve();
        landed.current = () => {
          setWin(r.result.mult);
          resolve();
        };
        setSpin({ id: Date.now(), reels });
      })
    );
  }

  const table: [SlotSymbol[], number][] = [
    ...(Object.keys(SLOT_THREE) as SlotSymbol[]).map((k) => [[k, k, k], SLOT_THREE[k]] as [SlotSymbol[], number]),
    [["seven", "seven"], SLOT_TWO_SEVENS],
    [["cherry", "cherry"], SLOT_TWO_CHERRIES],
  ];

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Slot makinesi</h3>
        {win !== null && <span className={`num result-pop text-sm font-semibold ${win > 0 ? "text-gain" : "text-mute"}`}>{win > 0 ? `×${win}` : "Tutmadı"}</span>}
      </div>
      <p className="text-xs text-mute">Kolu çek ya da Çevir'e bas. Orta çizgide üç aynı sembol ya da iki 7 / iki kiraz kazandırır. Uzun vadede bahsin %{Math.round(SLOT_RTP * 1000) / 10}'i geri döner.</p>
      <div className="my-3">
        <SlotMachine spin={spin} win={win} disabled={!can} onPull={go} onDone={() => { landed.current?.(); landed.current = null; }} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <BetInput id="sl-bet" value={bet} onChange={setBet} max={max} />
        <button className="btn btn-primary" disabled={!can} onClick={go}>
          {spin && busy ? "Dönüyor…" : "Çevir"}
        </button>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-mute hover:text-white">Ödeme tablosu</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {table.map(([syms, m]) => (
            <li key={syms.join("")} className="flex items-center justify-between gap-2">
              <span className="flex">{syms.map((x, i) => <SlotIcon key={i} s={x} size={20} />)}</span>
              <span className="num text-xs">×{m}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---------------- Şans çarkı ----------------

function Spin({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [spin, setSpin] = useState<{ id: number; index: number } | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const landed = useRef<(() => void) | null>(null);
  useEffect(() => () => landed.current?.(), []);
  const b = Number(bet) || 0;
  // Çarpan dağılımı (bilgi satırı için)
  const counts = SPIN_SEGMENTS.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  const tiers = Object.keys(counts)
    .map(Number)
    .filter((x) => x > 0)
    .sort((a, z) => z - a);

  async function go() {
    await play({ game: "spin", bet: b }, (r) =>
      new Promise<void>((resolve) => {
        const index = r.result?.index;
        if (typeof index !== "number") return resolve();
        landed.current = () => {
          setLast(SPIN_SEGMENTS[index]);
          resolve();
        };
        setSpin({ id: Date.now(), index });
      })
    );
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Şans çarkı</h3>
        {last !== null && <span className={`num text-sm font-semibold ${last > 1 ? "text-gain" : last === 0 ? "text-loss" : "text-amber"}`}>{spinLabel(last)}</span>}
      </div>
      <p className="text-xs text-mute">
        Çarkı çevir, ibrenin gösterdiği çarpan kadar al. {tiers.map((t) => `×${t.toLocaleString("tr-TR")} (${counts[t]})`).join(", ")}; {counts[0]} dilim boş. Uzun vadede bahsin %{Math.round(SPIN_RTP * 1000) / 10}'i geri döner.
      </p>
      <div className="my-3 flex justify-center">
        <SpinWheel spin={spin} onDone={() => { landed.current?.(); landed.current = null; }} size={232} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <BetInput id="s-bet" value={bet} onChange={setBet} max={max} />
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={go}>
          {spin && busy ? "Dönüyor…" : "Çevir"}
        </button>
      </div>
    </section>
  );
}

// ---------------- Zar ----------------

function Dice({ cash, max, busy, play }: { cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [choice, setChoice] = useState<"high" | "low" | "seven">("high");
  const [values, setValues] = useState<[number, number]>([5, 2]);
  const [roll, setRoll] = useState(0);
  const [sum, setSum] = useState<number | null>(null);
  const b = Number(bet) || 0;

  async function go() {
    await play({ game: "dice", bet: b, choice }, (r) => {
      const d = r.result?.dice;
      if (!Array.isArray(d)) return Promise.resolve();
      setSum(null);
      setValues([d[0], d[1]]);
      setRoll((x) => x + 1);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return new Promise<void>((res) =>
        setTimeout(() => {
          setSum(d[0] + d[1]);
          res();
        }, reduce ? 0 : DICE_MS + 100)
      );
    });
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="heading text-lg">Zar</h3>
        {sum !== null && <span className="num result-pop text-sm">Toplam <span className={`text-lg font-semibold ${sum === 7 ? "text-amber" : "text-white"}`}>{sum}</span></span>}
      </div>
      <p className="text-xs text-mute">İki zarın toplamı. 7 gelirse yüksek ve düşük kaybeder.</p>
      <div className="my-2 rounded-md bg-[radial-gradient(ellipse_at_center,#1F4A33_0%,#163626_70%)] ring-1 ring-inset ring-black/30">
        <Dice3D values={values} roll={roll} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DICE_LABEL) as (keyof typeof DICE_LABEL)[]).map((k) => (
          <button key={k} type="button" aria-pressed={choice === k} onClick={() => setChoice(k)} className={`rounded border px-2.5 py-1 text-sm ${choice === k ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}>
            {DICE_LABEL[k]} <span className="num text-xs text-mute">×{DICE_PAYOUT[k].toLocaleString("tr-TR")}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <BetInput id="d-bet" value={bet} onChange={setBet} max={max} />
        <button className="btn btn-primary" disabled={busy || !okBet(b, cash, max)} onClick={go}>
          At
        </button>
      </div>
    </section>
  );
}

// ---------------- Blackjack ----------------

function Blackjack({ hand, cash, max, busy, play }: { hand: Hand | null; cash: number; max: number; busy: boolean; play: Play }) {
  const [bet, setBet] = useState("1000");
  const [shown, setShown] = useState<Hand | null>(null); // biten elin son hali
  // Yanıt geldiği an yeni kartları göster; sonuç yazısı, fişler ve kasa kartlar inene kadar bekler
  const [pending, setPending] = useState<{ hand: Hand; live: boolean } | null>(null);
  const [outcome, setOutcome] = useState<BjOutcome>(null);
  const [settled, setSettled] = useState(false);
  const b = Number(bet) || 0;
  const h = pending?.hand ?? hand ?? shown;
  const live = pending ? pending.live : !!hand;

  async function act(body: object, fresh = false) {
    const before = { player: fresh ? 0 : h?.player.length ?? 0, dealer: fresh ? 0 : h?.dealer.length ?? 0, live };
    await play(body, (res) => {
      const nh: Hand | undefined = res.result?.hand ?? undefined;
      if (!nh) return Promise.resolve();
      const done = !!res.result?.done;
      if (done) setShown(nh);
      setPending({ hand: nh, live: !done });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return new Promise<void>((ok) =>
        setTimeout(() => {
          if (done) {
            setOutcome({ net: Number(res.result.net ?? 0), text: String(res.result.result ?? "") });
            setSettled(true);
          }
          ok();
        }, reduce ? 0 : tableSettleMs(before, nh, !done))
      );
    });
    setPending(null);
  }

  return (
    <section className="card p-4">
      <h3 className="heading text-lg">Blackjack</h3>
      <p className="text-xs text-mute">21'e en yakın olan kazanır. Krupiye 17'de durur, blackjack 3'e 2 öder. İlk iki kartta bahsi ikiye katlayabilirsin.</p>
      <div className="mt-3">
        <BlackjackTable hand={h} live={live} outcome={outcome} settled={settled} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {live ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ game: "blackjack", action: "hit" })}>
              Kart çek
            </button>
            <button className="btn" disabled={busy} onClick={() => act({ game: "blackjack", action: "stand" })}>
              Dur
            </button>
            {(pending?.hand ?? hand)?.canDouble && (
              <button className="btn" disabled={busy || cash < (h?.bet ?? 0)} onClick={() => act({ game: "blackjack", action: "double" })}>
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
              onClick={() => {
                setShown(null);
                setOutcome(null);
                setSettled(false);
                act({ game: "blackjack", action: "deal", bet: b }, true);
              }}
            >
              {h ? "Yeni el" : "Kart dağıt"}
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
              <li key={x.id} className="relative flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                {x.status === "open" && <BetProgress bet={x} now={now} />}
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

/** Süren piyasa bahsinin kalan süresi: satırın altında incelen bir çizgi. */
function BetProgress({ bet, now }: { bet: MarketBet; now: number }) {
  const end = new Date(bet.settleAt).getTime();
  // Bahis 15 dakikalık ya da 1 saatlik
  const total = end - now <= 15 * 60_000 ? 15 * 60_000 : 60 * 60_000;
  const pct = Math.max(0, Math.min(100, ((end - now) / total) * 100));
  return (
    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
      <span className="bet-progress block h-full bg-amber/70" style={{ width: `${pct}%` }} />
    </span>
  );
}

// ---------------- Bahis bürosu ----------------

function Pools({ pools, cash, max, busy, play, now }: { pools: Data["pools"]; cash: number; max: number; busy: boolean; play: Play; now: number }) {
  if (!pools.ready) return <SkeletonCard label="Bahis bürosu kapalı." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">Bahisler ortak havuzda toplanır. Sonuç belli olunca büro %5'ini alır, kalanı bilenler yatırdıkları oranda paylaşır. Kimse bilemezse herkese iade edilir.</p>
      {pools.open.length === 0 && <SkeletonCard label="Şu an açık bahis yok." />}
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
