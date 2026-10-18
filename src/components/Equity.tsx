"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompanyMark } from "./Portrait";
import { formatCompactMoney, formatMoney } from "@/lib/game/economy";
import { equityBuyTotal, equitySellTotal, ISSUE_FEE, issueProceeds } from "@/lib/game/equity";
import type { LogoSpec } from "@/lib/game/config";
import { formatPrice } from "@/lib/game/market";
import { apiFetch } from "@/lib/supabase/client";

type Me = {
  ipo: string | null;
  price: number;
  total: number;
  founder: number;
  float: number;
  held: number;
  ownership: number;
  value: number;
  ownerWorth: number;
  maxIssue: number;
  canIpo: boolean;
  minValue: number;
  minShares: number;
  shareholders: { id: string; name: string; shares: number }[];
};
export type EquityListing = {
  id: string;
  name: string;
  founderName: string;
  logo: LogoSpec | null;
  logoUrl: string | null;
  reputation: number;
  price: number;
  total: number;
  founder: number;
  held: number;
  float: number;
  value: number;
  myShares: number;
  myBasis: number;
};
type Data = { ready: boolean; me: Me; list: EquityListing[] };

const pct = (x: number) => `%${(Math.round(x * 1000) / 10).toLocaleString("tr-TR")}`;

export function Equity({ cash, onState, notify }: { cash: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState("");
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/equity")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [load, notify]);

  async function post(body: object) {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/equity", { method: "POST", body: JSON.stringify(body) });
      setD(r);
      if (r.state) onState({ ...r.state, journal: r.journal });
      if (r.message) notify(r.message);
      setN("");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="card p-4 text-sm text-mute">Hisse defteri açılıyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Halka arz için veritabanında <code className="text-white">011_halka_arz_operasyon.sql</code> çalıştırılmalı.</div>;
  const m = d.me;
  const k = Math.max(0, Math.trunc(Number(n) || 0));
  const after = m.founder / (m.total + k);

  return (
    <div className="space-y-3">
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="heading text-lg">{m.ipo ? "Şirketin halka açık" : "Halka arz"}</h3>
          <span className="num text-sm text-mute">
            Hisse fiyatı <span className="text-white">{formatPrice(m.price)}</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-mute">
          Halka arzda yeni hisse basılır ve yatırımcılara satılır: kasaya para girer ({pct(ISSUE_FEE)} aracı payı düşülür), kurucu payın küçülür. Sıralamada şirket değerinin yalnızca senin payına düşen kısmı sayılır.
          Fiyat şirketinin değerine ve itibarına göre hesaplanır; diğer oyuncular hisseni alıp satabilir. Kurucu payın %51'in altına inemez.
        </p>
        <dl className="num mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line text-sm sm:grid-cols-4">
          <Cell label="Şirket değeri" value={formatCompactMoney(m.value)} />
          <Cell label="Senin payın" value={pct(m.ownership)} />
          <Cell label="Payının değeri" value={formatCompactMoney(m.ownerWorth)} />
          <Cell label="Toplam hisse" value={m.total.toLocaleString("tr-TR")} />
        </dl>

        {!m.ipo && !m.canIpo ? (
          <p className="mt-3 text-sm text-amber">Halka arz için şirket değerinin en az {formatMoney(m.minValue)} olması gerekiyor.</p>
        ) : m.maxIssue > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <div className="w-40">
              <label className="label" htmlFor="eq-n">{m.ipo ? "Ek ihraç (adet)" : "Satılacak yeni hisse"}</label>
              <input id="eq-n" className="input num" inputMode="numeric" placeholder={`${m.ipo ? 1 : m.minShares}-${m.maxIssue}`} value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />
            </div>
            <button className="btn btn-primary" disabled={busy || k < (m.ipo ? 1 : m.minShares) || k > m.maxIssue} onClick={() => post({ action: "issue", shares: k })}>
              {m.ipo ? "Hisse bas ve sat" : "Halka arz et"}
            </button>
            {m.ipo && m.float > 0 && (
              <button className="btn" disabled={busy || k < 1 || k > m.float || cash < equityBuyTotal(k, m.price)} onClick={() => post({ action: "buyback", shares: k })}>
                Geri al
              </button>
            )}
            <p className="w-full text-xs text-mute">
              {k > 0 && k <= m.maxIssue
                ? `Kasaya ${formatMoney(issueProceeds(k, m.price))} girer, payın ${pct(after)} olur.`
                : `En fazla ${m.maxIssue.toLocaleString("tr-TR")} yeni hisse basabilirsin.`}
              {m.ipo && m.float > 0 && ` Piyasada ${m.float.toLocaleString("tr-TR")} serbest hisse var; geri alım ${k > 0 ? formatMoney(equityBuyTotal(k, m.price)) : "fiyat + %1"} tutar ve hisseleri iptal eder.`}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-mute">Kurucu payın %51'e indi; daha fazla hisse basılamaz.</p>
        )}

        {m.shareholders.length > 0 && (
          <div className="mt-3 border-t border-line pt-3 text-sm">
            <div className="text-xs text-mute">Hissedarların</div>
            <ul className="mt-1 space-y-0.5">
              {m.shareholders.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <Link href={`/sirket/${s.id}`} className="hover:text-amber">
                    {s.name}
                  </Link>
                  <span className="num text-mute">
                    {s.shares.toLocaleString("tr-TR")} hisse, {pct(s.shares / m.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Halka açık oyuncu şirketleri</h3>
        {d.list.length === 0 ? (
          <p className="px-4 py-3 text-sm text-mute">Henüz halka açılan başka şirket yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.list.map((c) => (
              <EquityRow key={c.id} c={c} cash={cash} busy={busy} post={post} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Başka bir şirketin hissesini alıp satma satırı (Finans ve profil sayfası ortak kullanır). */
export function EquityRow({ c, cash, busy, post, compact }: { c: EquityListing; cash: number; busy: boolean; post: (b: object) => Promise<void> | void; compact?: boolean }) {
  const [n, setN] = useState("");
  const k = Math.max(0, Math.trunc(Number(n) || 0));
  const value = c.myShares * c.price;
  return (
    <li className={compact ? "" : "px-4 py-3"}>
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/sirket/${c.id}`} className="flex min-w-0 items-center gap-2 hover:text-amber">
            {c.logo && <CompanyMark spec={c.logo} url={c.logoUrl} size={20} />}
            <span className="truncate font-medium">{c.name}</span>
          </Link>
          <span className="num text-sm">{formatPrice(c.price)}</span>
        </div>
      )}
      <div className="num mt-1 text-xs text-mute">
        Kurucu {pct(c.founder / c.total)}, oyuncular {pct(c.held / c.total)}, piyasada {c.float.toLocaleString("tr-TR")} hisse. Şirket değeri {formatCompactMoney(c.value)}.
        {c.myShares > 0 && (
          <span className="text-white">
            {" "}
            Sende {c.myShares.toLocaleString("tr-TR")} hisse ({pct(c.myShares / c.total)}), değeri {formatMoney(Math.floor(value))}
            <span className={value >= c.myBasis ? " text-gain" : " text-loss"}>
              {" "}
              ({value >= c.myBasis ? "+" : "−"}
              {formatMoney(Math.abs(Math.floor(value - c.myBasis)))})
            </span>
            .
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`eqr-${c.id}`}>Adet</label>
        <input id={`eqr-${c.id}`} className="input num !w-28 !py-1.5 text-sm" inputMode="numeric" placeholder="Adet" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />
        <button className="btn btn-primary !py-1.5 text-xs" disabled={busy || k < 1 || k > c.float || cash < equityBuyTotal(k, c.price)} onClick={() => Promise.resolve(post({ action: "buy", targetId: c.id, shares: k })).then(() => setN(""))}>
          Al{k > 0 ? `, ${formatMoney(equityBuyTotal(k, c.price))}` : ""}
        </button>
        {c.myShares > 0 && (
          <button className="btn !py-1.5 text-xs" disabled={busy || k < 1 || k > c.myShares} onClick={() => Promise.resolve(post({ action: "sell", targetId: c.id, shares: k })).then(() => setN(""))}>
            Sat{k > 0 && k <= c.myShares ? `, ${formatMoney(equitySellTotal(k, c.price))}` : ""}
          </button>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-3 py-2">
      <dt className="text-xs text-mute">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
