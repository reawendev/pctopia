"use client";

import { CompanyMark, Portrait } from "./Portrait";
import { formatCompactMoney } from "@/lib/game/economy";

export type WorldData = {
  serverTime: number;
  event: { id: string; title: string; text: string; effects: string[]; startsAt: number; endsAt: number };
  pastEvents: { id: string; title: string; startsAt: number }[];
  season: { number: number; startedAt: string; suggestedEndAt: number } | null;
  hallOfFame: { number: number; startedAt: string; endedAt: string; champions: any[] }[];
};

function left(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d} gün ${h} sa`;
  return h > 0 ? `${h} sa ${m % 60} dk` : `${m % 60} dk`;
}

/** Ofis ekranındaki kompakt gündem kartı. */
export function WorldCard({ w, now }: { w: WorldData; now: number }) {
  const calm = w.event.id === "calm";
  return (
    <section className={`card p-4 ${calm ? "" : "border-amber/40"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs text-mute">Dünya gündemi</div>
        <div className="text-xs text-mute">
          {left(w.event.endsAt - now)} sonra değişir.
          {w.season && <> Sezon {w.season.number} bitişine {left(w.season.suggestedEndAt - now)}.</>}
        </div>
      </div>
      <div className="heading mt-0.5 text-lg">{w.event.title}</div>
      <p className="text-sm text-white/85">{w.event.text}</p>
      {w.event.effects.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {w.event.effects.map((e) => (
            <li key={e} className="rounded border border-line bg-ink/60 px-2 py-0.5 text-xs">
              {e}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Gündem sekmesindeki şeref listesi ve geçmiş olaylar. */
export function HallOfFame({ w }: { w: WorldData }) {
  const medal = ["text-amber", "text-white", "text-[#C08A5A]"];
  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Şeref listesi</h2>
        {w.hallOfFame.length === 0 ? (
          <p className="px-4 py-3 text-sm text-mute">
            {w.season ? `Sezon ${w.season.number} sürüyor. ` : ""}Sezon bitince ilk üç şirket buraya yazılır.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {w.hallOfFame.map((s) => (
              <li key={s.number} className="px-4 py-3">
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-serif font-semibold">Sezon {s.number}</span>
                  <span className="text-xs text-mute">
                    {new Date(s.startedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – {new Date(s.endedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                </div>
                {s.champions.length === 0 ? (
                  <p className="text-sm text-mute">Bu sezon şirket yoktu.</p>
                ) : (
                  <ol className="grid gap-2 sm:grid-cols-3">
                    {s.champions.map((c: any) => (
                      <li key={c.rank} className="flex items-center gap-2 rounded border border-line bg-ink/50 p-2">
                        <span className={`font-serif text-xl ${medal[c.rank - 1] ?? "text-mute"}`}>{c.rank}</span>
                        <div className="shrink-0 overflow-hidden rounded-sm">
                          <Portrait spec={c.character} url={c.portraitUrl} size={36} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate text-sm font-medium">
                            {c.logo && <CompanyMark spec={c.logo} url={c.logoUrl} size={14} />}
                            <span className="truncate">{c.name}</span>
                          </div>
                          <div className="num truncate text-xs text-mute">
                            {c.founderName}, {formatCompactMoney(c.netWorth)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Önceki gündemler</h2>
        <ul className="divide-y divide-line text-sm">
          {w.pastEvents.map((e) => (
            <li key={e.startsAt} className="flex justify-between gap-3 px-4 py-2">
              <span>{e.title}</span>
              <span className="text-xs text-mute">{new Date(e.startsAt).toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
