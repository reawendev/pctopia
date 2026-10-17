"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PriceChart, Sparkline } from "./PriceChart";
import { formatCompactMoney, formatMoney } from "@/lib/game/economy";
import {
  buyTotal,
  formatPct,
  formatPrice,
  maxAffordable,
  RISK_LABEL,
  sellTotal,
  STOCK_BY_ID,
  STOCKS,
  TRADE_FEE,
  type Holdings,
} from "@/lib/game/market";
import { apiFetch } from "@/lib/supabase/client";

type Quote = { id: string; price: number; open24h: number; change24h: number; spark: number[] };
type News = { tick: number; at: number; stockId: string; dir: 1 | -1; impact: number; text: string };
type Trade = { id: number; stockId: string; side: "buy" | "sell"; shares: number; price: number; total: number; at: string };
type MarketData = { tick: number; nextTickAt: number; serverTime: number; quotes: Quote[]; news: News[]; trades: Trade[] };
type Range = "1g" | "1h" | "1a";

const RANGE_LABEL: Record<Range, string> = { "1g": "1 Gün", "1h": "1 Hafta", "1a": "1 Ay" };

function ago(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function pnlClass(x: number) {
  return x > 0 ? "text-gain" : x < 0 ? "text-loss" : "text-mute";
}

export function Market({
  cash,
  holdings,
  onState,
  notify,
}: {
  cash: number;
  holdings: Holdings;
  onState: (s: any) => void;
  notify: (msg: string) => void;
}) {
  const [data, setData] = useState<MarketData | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string>(STOCKS[0].id);
  const [range, setRange] = useState<Range>("1g");
  const [points, setPoints] = useState<{ t: number; p: number }[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const pick = useCallback((id: string) => {
    setSelected(id);
    setQty("");
    // Dar ekranda detay listenin altında; seçince oraya kaydır
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  const load = useCallback(async () => {
    const d = await apiFetch<MarketData>("/api/market");
    setData(d);
    setSkew(d.serverTime - Date.now());
  }, []);

  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [load, notify]);

  // Saniyelik saat + tik değişince yenile
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + skew;
  const nextIn = data ? Math.max(0, data.nextTickAt - serverNow) : 0;

  useEffect(() => {
    if (!data) return;
    const wait = Math.max(1000, data.nextTickAt - (Date.now() + skew) + 1500);
    const t = setTimeout(() => load().catch(() => {}), wait);
    return () => clearTimeout(t);
  }, [data, skew, load]);

  useEffect(() => {
    let alive = true;
    apiFetch<{ points: { t: number; p: number }[] }>(`/api/market/history?id=${selected}&range=${range}`)
      .then((r) => alive && setPoints(r.points))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selected, range, data?.tick]);

  const quotes = useMemo(() => new Map((data?.quotes ?? []).map((q) => [q.id, q])), [data]);
  const prices = useMemo(() => Object.fromEntries((data?.quotes ?? []).map((q) => [q.id, q.price])), [data]);

  const portfolio = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const [id, h] of Object.entries(holdings)) {
      value += h.shares * (prices[id] ?? 0);
      cost += h.costBasis;
    }
    return { value: Math.floor(value), cost, pnl: Math.floor(value) - cost };
  }, [holdings, prices]);

  const q = quotes.get(selected);
  const stock = STOCK_BY_ID[selected];
  const pos = holdings[selected] ?? { shares: 0, costBasis: 0 };
  const n = Math.max(0, Math.trunc(Number(qty) || 0));
  const price = q?.price ?? 0;
  const est = side === "buy" ? buyTotal(n, price) : sellTotal(n, price);
  const maxN = side === "buy" ? maxAffordable(cash, price) : pos.shares;
  const posValue = Math.floor(pos.shares * price);
  const posPnl = posValue - pos.costBasis;

  async function trade() {
    if (n < 1) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/market/trade", { method: "POST", body: JSON.stringify({ stockId: selected, side, shares: n }) });
      onState(r);
      notify(
        `${n.toLocaleString("tr-TR")} adet ${selected} ${side === "buy" ? "alındı" : "satıldı"}, ${formatPrice(r.trade.price)} fiyattan. Toplam ${formatMoney(r.trade.total)}.`
      );
      setQty("");
      load().catch(() => {});
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="card p-4 text-sm text-mute">Piyasa verisi yükleniyor…</div>;

  const mm = Math.floor(nextIn / 60000);
  const ss = Math.floor((nextIn % 60000) / 1000);

  return (
    <div className="space-y-4">
      {/* Portföy özeti */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="text-xs text-mute">Portföy</div>
          <div className="num mt-1 font-semibold">{formatCompactMoney(portfolio.value)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-mute">Kâr / Zarar</div>
          <div className={`num mt-1 font-semibold ${pnlClass(portfolio.pnl)}`}>
            {portfolio.pnl > 0 ? "+" : ""}
            {formatCompactMoney(portfolio.pnl)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-mute">Sonraki fiyat</div>
          <div className="num mt-1 font-semibold">
            {mm}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Seçili hisse */}
        <div ref={detailRef} className="scroll-mt-4 space-y-4 lg:order-2">
          <section className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="num rounded border border-line bg-ink px-1.5 py-0.5 text-xs text-amber">{stock.id}</span>
                  <h2 className="heading truncate text-lg">{stock.name}</h2>
                </div>
                <div className="mt-1 text-xs text-mute">
                  {stock.sector}, {RISK_LABEL[stock.risk].toLowerCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-xl font-semibold">{formatPrice(price)}</div>
                {q && <div className={`num text-xs ${pnlClass(q.change24h)}`}>son 24 saatte {formatPct(q.change24h)}</div>}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-mute">{stock.desc}</p>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-ink p-1 text-xs">
              {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded py-1.5 ${range === r ? "bg-raised text-white" : "text-mute"}`}>
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <PriceChart points={points} range={range} />
            </div>
          </section>

          <section className="card p-4">
            {pos.shares > 0 && (
              <dl className="mb-4 grid grid-cols-3 gap-2 border-b border-line pb-4 text-xs">
                <div>
                  <dt className="text-mute">Elindeki</dt>
                  <dd className="num mt-0.5 text-sm">{pos.shares.toLocaleString("tr-TR")} adet</dd>
                </div>
                <div>
                  <dt className="text-mute">Ort. maliyet</dt>
                  <dd className="num mt-0.5 text-sm">{formatPrice(pos.costBasis / pos.shares)}</dd>
                </div>
                <div>
                  <dt className="text-mute">K/Z</dt>
                  <dd className={`num mt-0.5 text-sm ${pnlClass(posPnl)}`}>
                    {formatPct(pos.costBasis ? posPnl / pos.costBasis : 0)}
                  </dd>
                </div>
              </dl>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-md bg-ink p-1 text-sm">
              <button onClick={() => setSide("buy")} className={`rounded py-2 font-medium ${side === "buy" ? "bg-gain/15 text-gain" : "text-mute"}`}>
                Al
              </button>
              <button onClick={() => setSide("sell")} className={`rounded py-2 font-medium ${side === "sell" ? "bg-loss/15 text-loss" : "text-mute"}`}>
                Sat
              </button>
            </div>

            <label className="label mt-4" htmlFor="qty">Adet</label>
            <input
              id="qty"
              className="input num"
              inputMode="numeric"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[0.1, 0.25, 0.5, 1].map((f) => (
                <button key={f} type="button" className="btn !px-0 !py-1.5 text-xs" disabled={maxN < 1} onClick={() => setQty(String(Math.max(1, Math.floor(maxN * f))))}>
                  {f === 1 ? "Max" : `%${f * 100}`}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1 text-xs text-mute">
              <div className="flex justify-between">
                <span>{side === "buy" ? "Ödenecek" : "Eline geçecek"} (komisyon %{(TRADE_FEE * 100).toLocaleString("tr-TR")})</span>
                <span className="num text-white">{formatMoney(n ? est : 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{side === "buy" ? "Alınabilecek en fazla" : "Satılabilecek en fazla"}</span>
                <span className="num">{maxN.toLocaleString("tr-TR")} adet</span>
              </div>
            </div>

            <button
              className={`btn mt-4 w-full ${side === "buy" ? "btn-primary" : "!border-loss !bg-loss !text-ink"}`}
              disabled={busy || n < 1 || n > maxN}
              onClick={trade}
            >
              {busy ? "İşleniyor…" : side === "buy" ? `${stock.id} al` : `${stock.id} sat`}
            </button>
            <p className="mt-2 text-center text-[11px] text-mute">İşlem, sunucudaki anlık fiyattan gerçekleşir.</p>
          </section>
        </div>

        {/* Hisse listesi */}
        <ul className="card order-first divide-y divide-line self-start lg:order-1">
          {STOCKS.map((s) => {
            const sq = quotes.get(s.id);
            const h = holdings[s.id];
            if (!sq) return null;
            return (
              <li key={s.id}>
                <button
                  onClick={() => pick(s.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected === s.id ? "bg-amber/5" : "hover:bg-raised"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="num text-sm font-semibold">{s.id}</span>
                      {h && <span className="num text-[10px] text-amber">{h.shares.toLocaleString("tr-TR")} adet</span>}
                    </div>
                    <div className="truncate text-xs text-mute">{s.name}</div>
                  </div>
                  <Sparkline values={sq.spark} up={sq.change24h >= 0} />
                  <div className="w-20 text-right">
                    <div className="num text-sm">{formatPrice(sq.price)}</div>
                    <div className={`num text-xs ${pnlClass(sq.change24h)}`}>{formatPct(sq.change24h)}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="border-b border-line px-4 py-3 font-serif font-semibold">Piyasa haberleri</h3>
          {data.news.length === 0 ? (
            <p className="p-4 text-sm text-mute">Son 3 günde önemli bir gelişme yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.news.map((nw) => (
                <li key={`${nw.stockId}-${nw.tick}`} className="flex gap-3 px-4 py-3">
                  <span className={`num mt-0.5 text-xs ${nw.dir > 0 ? "text-gain" : "text-loss"}`}>{nw.dir > 0 ? "▲" : "▼"}</span>
                  <div className="min-w-0 flex-1">
                    <button className="text-left text-sm hover:text-amber" onClick={() => pick(nw.stockId)}>
                      {nw.text}
                    </button>
                    <div className="mt-0.5 text-[11px] text-mute">
                      <span className="num">{nw.stockId}</span>, {ago(serverNow - nw.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3 className="border-b border-line px-4 py-3 font-serif font-semibold">İşlemlerin</h3>
          {data.trades.length === 0 ? (
            <p className="p-4 text-sm text-mute">Henüz işlem yapmadın.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.trades.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <span className={t.side === "buy" ? "text-gain" : "text-loss"}>{t.side === "buy" ? "Alış" : "Satış"}</span>{" "}
                    <span className="num">{t.stockId}</span>
                    <div className="num text-[11px] text-mute">
                      {t.shares.toLocaleString("tr-TR")} × {formatPrice(t.price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num">{formatMoney(t.total)}</div>
                    <div className="text-[11px] text-mute">{ago(serverNow - new Date(t.at).getTime())}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
