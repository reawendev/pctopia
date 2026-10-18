"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCompactMoney, formatMoney } from "@/lib/game/economy";
import type { Facility as Level } from "@/lib/game/facility";
import { apiFetch } from "@/lib/supabase/client";

type Data = {
  ready: boolean;
  level: number;
  building: { level: number; readyAt: string } | null;
  levels: Level[];
  effects: { kind: string; value: number; label: string; expiresAt: string }[];
};

function left(ms: number) {
  const total = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? (m ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
}

/** Ofis: tesis kartı ve süren krizler. */
export function Facility({ cash, now, onState, notify }: { cash: number; now: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/facility")), []);
  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [load]);
  // İnşaat bitince yenile
  const readyAt = d?.building ? new Date(d.building.readyAt).getTime() : 0;
  useEffect(() => {
    if (!readyAt) return;
    const t = setTimeout(() => load().catch(() => {}), Math.max(1000, readyAt - Date.now() + 1500));
    return () => clearTimeout(t);
  }, [readyAt, load]);

  async function upgrade() {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/facility", { method: "POST", body: JSON.stringify({ action: "upgrade" }) });
      setD(r);
      if (r.state) onState({ ...r.state, journal: r.journal });
      if (r.message) notify(r.message);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d || !d.ready) return null;
  const cur = d.levels[d.level - 1];
  const next = d.levels[d.level];
  const building = d.building ? d.levels[d.building.level - 1] : null;

  return (
    <>
      {d.effects.length > 0 && (
        <section className="card border-loss/50">
          <h2 className="border-b border-line px-4 py-2.5 font-serif font-semibold text-loss">Süren krizler</h2>
          <ul className="divide-y divide-line text-sm">
            {d.effects.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2">
                <span>{e.label}</span>
                <span className="num shrink-0 text-mute">{left(new Date(e.expiresAt).getTime() - now)} kaldı</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif font-semibold">
            Tesis: <span className="text-amber-soft">{cur.name}</span>
          </h2>
          <span className="text-xs text-mute">
            {d.level}. seviye / {d.levels.length}
          </span>
        </div>
        <p className="mt-1 font-serif text-[15px] italic text-white/80">{cur.scene}</p>
        <p className="mt-2 text-xs text-mute">
          {cur.maxModels} model, model başına {cur.maxStock.toLocaleString("tr-TR")} adet depo, tek seferde {cur.batch.toLocaleString("tr-TR")} adet üretim
          {cur.scale > 0 ? `, üretim maliyeti −%${Math.round(cur.scale * 100)}` : ""}.
        </p>
        {building ? (
          <div className="mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-amber">İnşaat sürüyor: {building.name}</span>
              <span className="num text-mute">{left(readyAt - now)} kaldı</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, Math.max(2, Math.round((1 - (readyAt - now) / (building.hours * 3_600_000)) * 100)))}%` }} />
            </div>
          </div>
        ) : next ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0 text-sm">
              <div>
                Sonraki: <span className="font-medium">{next.name}</span>
              </div>
              <div className="text-xs text-mute">
                {next.maxModels} model, {next.maxStock.toLocaleString("tr-TR")} adet depo, tek seferde {next.batch.toLocaleString("tr-TR")} adet
                {next.scale > 0 ? `, maliyet −%${Math.round(next.scale * 100)}` : ""}. İnşaat {next.hours} saat, itibar +2.
              </div>
            </div>
            <button className="btn btn-primary shrink-0" disabled={busy || cash < next.cost} onClick={upgrade} title={formatMoney(next.cost)}>
              <span className="num">{formatCompactMoney(next.cost)}</span>&nbsp;ile büyüt
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gain">En büyük tesise ulaştın.</p>
        )}
      </section>
    </>
  );
}
