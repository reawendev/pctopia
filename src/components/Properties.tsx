"use client";

import { useEffect, useState } from "react";
import { formatCompactMoney, formatMoney } from "@/lib/game/economy";
import { STATUS_GROUP, type StatusItem } from "@/lib/game/finance";
import { apiFetch } from "@/lib/supabase/client";

type Item = StatusItem & { owned: boolean; resale: number };
type Data = { ready: boolean; items: Item[] };

export function Properties({ cash, onState, notify }: { cash: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch<Data>("/api/status").then(setD).catch((e) => notify(e.message));
  }, [notify]);

  async function act(body: object) {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/status", { method: "POST", body: JSON.stringify(body) });
      setD(r);
      if (r.state) onState({ ...r.state, journal: r.journal });
      if (r.message) notify(r.message);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="card p-4 text-sm text-mute">Katalog yükleniyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Mülkler için veritabanında <code className="text-white">007_finans.sql</code> çalıştırılmalı.</div>;
  const groups = Object.keys(STATUS_GROUP) as StatusItem["group"][];

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">Satın aldıkların itibarını artırır, partnerini mutlu eder ve profilinde görünür. Değerinin %70'i net değerine sayılır ve o fiyata geri satılabilir.</p>
      {groups.map((g) => (
        <section key={g} className="card">
          <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">{STATUS_GROUP[g]}</h3>
          <ul className="divide-y divide-line">
            {d.items
              .filter((i) => i.group === g)
              .map((i) => (
                <li key={i.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${i.owned ? "bg-gain/[0.05]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {i.name}
                      {i.owned && <span className="ml-2 text-xs text-gain">senin</span>}
                    </div>
                    <div className="text-xs text-mute">
                      {i.rep > 0 ? `İtibar +${i.rep}, ` : ""}partner yakınlığı +{i.love}
                    </div>
                  </div>
                  {i.owned ? (
                    <button className="btn !py-1.5 text-xs" disabled={busy} onClick={() => window.confirm(`${i.name} ${formatMoney(i.resale)} karşılığında satılsın mı?`) && act({ action: "sell", itemId: i.id })}>
                      Sat, {formatCompactMoney(i.resale)}
                    </button>
                  ) : (
                    <button className="btn btn-primary !py-1.5 text-xs" disabled={busy || cash < i.price} onClick={() => act({ action: "buy", itemId: i.id })}>
                      <span className="num">{formatCompactMoney(i.price)}</span>
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
