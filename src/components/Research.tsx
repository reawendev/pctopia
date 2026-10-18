"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/game/economy";
import { effectText, PATENT_HOURS, TECH_BY_ID, type Tech } from "@/lib/game/research";
import { apiFetch } from "@/lib/supabase/client";

type Row = Tech & {
  status: "locked" | "available" | "running" | "waiting" | "active";
  startedAt: string | null;
  doneAt: string | null;
  activeFrom: string | null;
  patent: { holder: { id: string; name: string; mine: boolean } | null; until: string | null; racing: number } | null;
};
type Data = { ready: boolean; running: string | null; techs: Row[]; effects: { parts: number; demand: number; premium: number } };

function dur(ms: number) {
  if (ms <= 0) return "birazdan";
  const total = Math.ceil(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? (m ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
}

export function Research({ cash, now, onState, notify }: { cash: number; now: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/research")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
    const t = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [load, notify]);

  async function start(id: string) {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/research", { method: "POST", body: JSON.stringify({ action: "start", techId: id }) });
      setD(r);
      if (r.state) onState({ ...r.state, journal: r.journal });
      if (r.message) notify(r.message);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="card p-4 text-sm text-mute">Ar-Ge dosyaları açılıyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Ar-Ge için veritabanında <code className="text-white">009_ihale_arge.sql</code> çalıştırılmalı.</div>;
  const total = effectText(d.effects);

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        Projeler atölyendeki bütün modelleri kalıcı olarak güçlendirir. Aynı anda tek proje yürütülür, bedeli başlarken ödenir. Patentli projeleri ilk bitiren, {PATENT_HOURS} saat boyunca tek başına kullanır.
        {total && <> Şu an etkin: <span className="text-white">{total}</span>.</>}
      </p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {d.techs.map((t) => {
          const done = t.doneAt ? new Date(t.doneAt).getTime() : 0;
          const started = t.startedAt ? new Date(t.startedAt).getTime() : 0;
          const progress = t.status === "running" ? Math.min(1, (now - started) / Math.max(1, done - started)) : 0;
          const holder = t.patent?.holder;
          const until = t.patent?.until ? new Date(t.patent.until).getTime() : 0;
          return (
            <li key={t.id} className={`card flex flex-col gap-2 p-4 ${t.status === "active" ? "border-gain/40" : t.status === "running" ? "border-amber/50" : ""} ${t.status === "locked" ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="heading text-lg">{t.name}</h3>
                {t.patent && <span className="shrink-0 rounded border border-amber/40 px-1.5 text-[11px] text-amber-soft">patentli</span>}
              </div>
              <p className="text-sm text-white/85">{t.desc}</p>
              <p className="text-sm">{effectText(t.effect).replace(/^./, (c) => c.toLocaleUpperCase("tr"))}.</p>
              {t.patent && (
                <p className="text-xs text-mute">
                  {holder && until > now
                    ? holder.mine
                      ? `Patent sende, ${dur(until - now)} daha kimse kullanamaz.`
                      : `Patent ${holder.name} şirketinde, ${dur(until - now)} sonra serbest. Şimdi bitirsen de patent bitince kullanabilirsin.`
                    : holder
                    ? `Patent süresi doldu (ilk bitiren ${holder.mine ? "sendin" : holder.name}).`
                    : t.patent.racing > 0
                    ? `${t.patent.racing} rakip bu patent için çalışıyor. İlk bitiren alır.`
                    : "Henüz kimse bitirmedi."}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                {t.status === "running" ? (
                  <div className="w-full">
                    <div className="flex justify-between text-xs">
                      <span className="text-amber">Sürüyor</span>
                      <span className="num text-mute">{dur(done - now)} kaldı</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink">
                      <div className="h-full rounded-full bg-amber" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                ) : t.status === "active" ? (
                  <span className="text-sm text-gain">Tamamlandı, etkin</span>
                ) : t.status === "waiting" ? (
                  <span className="text-sm text-amber">Tamamlandı, patent bitince etkin ({dur(new Date(t.activeFrom!).getTime() - now)})</span>
                ) : t.status === "locked" ? (
                  <span className="text-xs text-mute">Önce: {TECH_BY_ID[t.requires!].name}</span>
                ) : (
                  <>
                    <span className="num text-xs text-mute">
                      {formatMoney(t.cost)}, {t.hours} saat
                    </span>
                    <button className="btn btn-primary !py-1.5 text-xs" disabled={busy || !!d.running || cash < t.cost} onClick={() => start(t.id)}>
                      {d.running ? "Başka proje sürüyor" : "Başlat"}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
