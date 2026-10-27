"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompanyMark } from "./Portrait";
import { SkeletonCard } from "./Skeleton";
import type { LogoSpec } from "@/lib/game/config";
import { formatCompactMoney } from "@/lib/game/economy";
import { apiFetch } from "@/lib/supabase/client";

type Co = { id: string; name: string; founderName: string; logo: LogoSpec | null; logoUrl: string | null };
type Story = { id: number; section: string; title: string; text: string; at: string; company: Co | null; repDelta: number };
type Mover = { id: string; name: string; price: number; change: number };
type Edition = {
  ready: boolean;
  date: number;
  today: boolean;
  number: number;
  season: number | null;
  headline: Story | null;
  sections: { name: string; stories: Story[] }[];
  quote: { text: string; author: string; company: Co | null; likes: number } | null;
  market: { gainers: Mover[]; losers: Mover[] };
  top: { id: string; rank: number; name: string; netWorth: number; reputation: number; logo: LogoSpec | null; logoUrl: string | null }[];
  agenda: { title: string; text: string }[];
  count: number;
};

const DAYS: [number, string][] = [
  [0, "Bugün"],
  [1, "Dün"],
  [2, "2 gün önce"],
];

// Kâğıt: fildişi zemin, lacivert mürekkep
const INK = "text-[#16233A]";
const FADED = "text-[#4D5B70]";
const RULE = "border-[#16233A]";

function longDate(ms: number) {
  return new Date(ms + 3 * 3_600_000).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

function pct(n: number) {
  const v = (Math.round(n * 1000) / 10).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n >= 0 ? "+" : "−"}%${v.replace("-", "")}`;
}

/** Gündem → Gazete: günün sayısı. */
export function Newspaper() {
  const [day, setDay] = useState(0);
  const [data, setData] = useState<Edition | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (d: number) => {
    setError("");
    setData(await apiFetch<Edition>(`/api/newspaper?gun=${d}`));
  }, []);

  useEffect(() => {
    setData(null);
    load(day).catch((e) => setError(e.message));
    if (day !== 0) return;
    const t = setInterval(() => load(0).catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [day, load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-sm" role="tablist" aria-label="Sayı">
        {DAYS.map(([d, label]) => (
          <button
            key={d}
            role="tab"
            aria-selected={day === d}
            onClick={() => setDay(d)}
            className={`rounded px-3 py-1.5 ${day === d ? "bg-raised text-white" : "text-mute hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="card p-4 text-sm text-loss">{error}</div>
      ) : !data ? (
        <SkeletonCard label="Matbaa çalışıyor…" />
      ) : !data.ready ? (
        <div className="card p-4 text-sm text-mute">Gazete için veritabanında sosyal medya tabloları (005) olmalı.</div>
      ) : (
        <Paper e={data} />
      )}
    </div>
  );
}

function Paper({ e }: { e: Edition }) {
  return (
    <article className={`overflow-hidden rounded-md bg-[#ECE5D3] ${INK} shadow-[0_1px_0_rgba(0,0,0,0.3),0_12px_32px_-18px_rgba(0,0,0,0.6)]`}>
      {/* Künye */}
      <header className="px-4 pt-4 sm:px-6">
        <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b ${RULE} pb-1.5 text-[11px] uppercase tracking-[0.12em] ${FADED}`}>
          <span>
            Sayı {e.number}
            {e.season ? ` · ${e.season}. sezon` : ""}
          </span>
          <span>{longDate(e.date)}</span>
        </div>
        <h2 className="py-3 text-center font-display text-[clamp(26px,7vw,46px)] font-extrabold uppercase leading-none tracking-[0.04em]">PCTopia Gazetesi</h2>
        <div className={`flex items-center justify-between gap-3 border-y-[3px] border-double ${RULE} py-1 text-[11px] uppercase tracking-[0.12em] ${FADED}`}>
          <span>Sektörün nabzı</span>
          <span>{e.today ? "Gün içinde güncellenir" : "Arşiv"}</span>
        </div>
      </header>

      {!e.headline ? (
        <p className={`px-4 py-10 text-center font-serif text-lg italic sm:px-6 ${FADED}`}>{e.today ? "Sektör bugün sessiz. Matbaa ilk haberi bekliyor." : "O gün sektörde kayda değer bir şey olmamış."}</p>
      ) : (
        <div className="grid gap-x-6 px-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            {/* Manşet */}
            <section className={`border-b ${RULE} py-4`}>
              <Kicker s={e.headline} />
              <h3 className="mt-1 font-serif text-[clamp(24px,5vw,38px)] font-bold leading-[1.08]">{e.headline.title}</h3>
              <p className="mt-2 font-serif text-[17px] leading-snug">{e.headline.text}</p>
              <Byline s={e.headline} />
            </section>

            {/* Bölümler */}
            <div className="sm:columns-2 sm:gap-6">
              {e.sections.map((sec) => (
                <section key={sec.name} className="break-inside-avoid pt-4">
                  <h4 className={`border-b ${RULE} pb-1 text-[11px] font-semibold uppercase tracking-[0.16em]`}>{sec.name}</h4>
                  <ul className="divide-y divide-[#16233A]/20">
                    {sec.stories.map((s) => (
                      <li key={s.id} className="py-2.5">
                        <h5 className="font-serif text-[17px] font-semibold leading-tight">{s.title}</h5>
                        <p className="mt-1 font-serif text-[15px] leading-snug">{s.text}</p>
                        <Byline s={s} small />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          <aside className={`mt-4 space-y-4 border-t ${RULE} pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-4`}>
            <Box title="Borsa">
              <MoverList title="Yükselenler" list={e.market.gainers} />
              <MoverList title="Düşenler" list={e.market.losers} />
            </Box>
            <Box title="Sıralamada ilk beş">
              <ol className="space-y-1 text-sm">
                {e.top.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="num w-4 text-right font-serif font-semibold">{c.rank}</span>
                    {(c.logo || c.logoUrl) && <CompanyMark spec={c.logo as LogoSpec} url={c.logoUrl} size={16} title={c.name} />}
                    <Link href={`/sirket/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {c.name}
                    </Link>
                    <span className="num shrink-0 text-xs">{formatCompactMoney(c.netWorth)}</span>
                  </li>
                ))}
              </ol>
            </Box>
            {e.agenda.length > 0 && (
              <Box title="Günün gündemi">
                <ul className="space-y-2">
                  {e.agenda.map((a) => (
                    <li key={a.title}>
                      <div className="font-serif text-[15px] font-semibold leading-tight">{a.title}</div>
                      <p className={`text-[13px] leading-snug ${FADED}`}>{a.text}</p>
                    </li>
                  ))}
                </ul>
              </Box>
            )}
            {e.quote && (
              <Box title="Okur köşesi">
                <blockquote className="font-serif text-[15px] italic leading-snug">“{e.quote.text}”</blockquote>
                <p className={`mt-1 text-xs ${FADED}`}>
                  {e.quote.author}
                  {e.quote.company ? `, ${e.quote.company.name}` : ""}
                  {e.quote.likes ? ` · ${e.quote.likes} beğeni` : ""}
                </p>
              </Box>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}

function Kicker({ s }: { s: Story }) {
  const hot = s.section === "Kulis" || s.repDelta <= -5;
  return <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${hot ? "text-[#B0412F]" : FADED}`}>{s.section}</span>;
}

function Byline({ s, small }: { s: Story; small?: boolean }) {
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${small ? "text-[11px]" : "text-xs"} ${FADED}`}>
      {s.company && (
        <Link href={`/sirket/${s.company.id}`} className="inline-flex items-center gap-1 hover:underline">
          {(s.company.logo || s.company.logoUrl) && <CompanyMark spec={s.company.logo as LogoSpec} url={s.company.logoUrl} size={small ? 12 : 14} />}
          {s.company.name}
        </Link>
      )}
      <span>{clock(s.at)}</span>
      {s.repDelta !== 0 && <span className={`num ${s.repDelta > 0 ? "text-[#2F7A4B]" : "text-[#B0412F]"}`}>itibar {s.repDelta > 0 ? `+${s.repDelta}` : `−${-s.repDelta}`}</span>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className={`mb-1.5 border-b ${RULE} pb-1 text-[11px] font-semibold uppercase tracking-[0.16em]`}>{title}</h4>
      {children}
    </section>
  );
}

function MoverList({ title, list }: { title: string; list: Mover[] }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className={`text-[11px] ${FADED}`}>{title}</div>
      <ul className="text-sm">
        {list.map((m) => (
          <li key={m.id} className="flex justify-between gap-2">
            <span className="truncate">{m.name}</span>
            <span className={`num shrink-0 ${m.change >= 0 ? "text-[#2F7A4B]" : "text-[#B0412F]"}`}>{pct(m.change)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
