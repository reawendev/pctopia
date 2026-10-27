"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/game/economy";
import { apiFetch } from "@/lib/supabase/client";

type OpRow = { id: string; name: string; desc: string; result: string; p: number; caught: number; cost: number; available: boolean; reason: string | null };
type Data = { ready: boolean; ops: OpRow[]; block: string | null; nextAt: string | null };

/** Profil sayfasında: rakibe karşı gizli operasyonlar. */
export function Operations({ targetId, targetName, cash, notify, onRun }: { targetId: string; targetName: string; cash: number; notify: (m: string) => void; onRun?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ text: string; good: boolean } | null>(null);
  const load = useCallback(async () => setD(await apiFetch<Data>(`/api/ops?target=${encodeURIComponent(targetId)}`)), [targetId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function run(o: OpRow) {
    if (!window.confirm(`${targetName} şirketine karşı “${o.name}” düzenlensin mi? Bedeli ${formatMoney(o.cost)}. Yakalanırsan itibarın düşer ve herkes duyar.`)) return;
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/ops", { method: "POST", body: JSON.stringify({ target: targetId, op: o.id }) });
      setD(r);
      setLast({ text: r.message, good: r.result.success && !r.result.caught });
      onRun?.();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d || !d.ready) return null;
  return (
    <section className="card">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="font-serif font-semibold">Gizli operasyonlar</h2>
        <p className="text-xs text-mute">Rakibine karşı yürüteceğin işler. Başarı garanti değil; yakalanırsan itibarın düşer, haber olur ve {targetName} kimin yaptığını öğrenir.</p>
      </div>
      {last && <p className={`border-b border-line px-4 py-2.5 text-sm ${last.good ? "text-gain" : "text-amber"}`}>{last.text}</p>}
      {d.block && <p className="border-b border-line px-4 py-2.5 text-sm text-mute">{d.block}.</p>}
      <ul className="divide-y divide-line">
        {d.ops.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{o.name}</div>
              <div className="text-xs text-mute">
                {o.desc} Başarırsa {o.result}.
              </div>
              <div className="num mt-0.5 text-xs">
                <span className="text-white">başarı %{Math.round(o.p * 100)}</span>
                <span className="text-loss">, yakalanma %{Math.round(o.caught * 100)}</span>
                {!o.available && o.reason && !d.block && <span className="text-mute">. {o.reason}</span>}
              </div>
            </div>
            <button className="btn !py-1.5 text-xs" disabled={busy || !o.available || cash < o.cost} onClick={() => run(o)}>
              <span className="num">{formatMoney(o.cost)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
