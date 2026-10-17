"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Market } from "@/components/Market";
import { CompanyMark, Portrait } from "@/components/Portrait";
import { Ticker } from "@/components/Ticker";
import { EQUIPMENT, OFFLINE_CAP_HOURS, type CharacterSpec, type LogoSpec } from "@/lib/game/config";
import { formatCompactMoney, formatMoney, incomePerHour, pendingIncome, unitCost, type Owned } from "@/lib/game/economy";
import type { Holdings } from "@/lib/game/market";
import { dayNumber, stageFor } from "@/lib/game/stages";
import { apiFetch, supabaseBrowser } from "@/lib/supabase/client";
import { ago } from "@/lib/time";
import { useRequireSession } from "@/lib/useSession";

type Company = {
  id: string;
  name: string;
  founderName: string;
  logo: LogoSpec;
  character: CharacterSpec;
  cash: number;
  lastCollectedAt: string;
  createdAt: string | null;
  portraitUrl: string | null;
  logoUrl: string | null;
};

type JournalEntry = { id: number; kind: string; text: string; amount: number | null; at: string };

type State = {
  company: Company;
  owned: Owned;
  holdings: Holdings;
  portfolioValue: number;
  incomePerHour: number;
  pending: number;
  netWorth: number;
  serverTime: number;
};

type BoardRow = {
  id: string;
  rank: number;
  name: string;
  founderName: string;
  logo: LogoSpec;
  logoUrl: string | null;
  netWorth: number;
  isMe: boolean;
};
type Board = { total: number; top: BoardRow[]; me: { rank: number; netWorth: number } | null };

type Tab = "ofis" | "donanim" | "borsa" | "sektor";
const TABS: [Tab, string][] = [
  ["ofis", "Ofis"],
  ["donanim", "Donanım"],
  ["borsa", "Borsa"],
  ["sektor", "Sektör"],
];

export default function Oyun() {
  const router = useRouter();
  const ready = useRequireSession();
  const [state, setState] = useState<State | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("ofis");
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0); // sunucu saati - istemci saati
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState<Board | null>(null);

  const apply = useCallback((s: any) => {
    setState(s);
    if (Array.isArray(s.journal)) setJournal(s.journal);
    setSkew(s.serverTime - Date.now());
  }, []);

  const load = useCallback(async () => {
    const s = await apiFetch("/api/company");
    setIsAdmin(!!s.isAdmin);
    if (!s.hasCompany) {
      router.replace("/kurulus");
      return;
    }
    apply(s);
  }, [apply, router]);

  useEffect(() => {
    if (ready) load().catch((e) => setToast(e.message));
  }, [ready, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (tab !== "sektor" || !ready) return;
    const fetchBoard = () => apiFetch<Board>("/api/leaderboard").then(setBoard).catch(() => {});
    fetchBoard();
    const t = setInterval(fetchBoard, 20_000);
    return () => clearInterval(t);
  }, [tab, ready]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const pending = useMemo(() => {
    if (!state) return 0;
    return pendingIncome(state.owned, new Date(state.company.lastCollectedAt).getTime(), now + skew);
  }, [state, now, skew]);

  async function act(path: string, body?: object, okMsg?: (r: any) => string) {
    setBusy(true);
    try {
      const r = await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      apply(r);
      if (okMsg) setToast(okMsg(r));
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
  }

  if (!ready || !state) return <div className="p-8 text-sm text-mute">Genel merkeze bağlanılıyor…</div>;

  const { company, owned } = state;
  const rate = incomePerHour(owned);
  const capped = rate > 0 && pending >= rate * OFFLINE_CAP_HOURS;
  const career = stageFor(state.netWorth);
  const day = dayNumber(company.createdAt, now + skew);

  return (
    <>
      <Ticker />
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-5">
        {/* İsim plakası */}
        <header className="card relative mb-5 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/60 to-transparent" />
          <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
            <div className="shrink-0 rounded-sm border border-amber/50 p-1 shadow-[inset_0_0_0_1px_rgba(201,162,74,0.15)]">
              <Portrait spec={company.character} url={company.portraitUrl} size={96} className="sm:hidden" />
              <Portrait spec={company.character} url={company.portraitUrl} size={124} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="heading truncate text-xl sm:text-2xl">{company.founderName}</h1>
              <p className="mt-0.5 flex min-w-0 items-start gap-2 text-sm text-mute">
                <CompanyMark spec={company.logo} url={company.logoUrl} size={20} title={company.name} />
                <span className="min-w-0 break-words">Kurucu ve CEO, {company.name}</span>
              </p>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif text-base text-amber-soft">{career.stage.title}</span>
                {day && <span className="text-xs text-mute">{day}. gün</span>}
              </div>
              {career.next && (
                <div className="mt-1.5 max-w-sm">
                  <div className="h-1 overflow-hidden rounded-full bg-ink">
                    <div className="h-full rounded-full bg-amber" style={{ width: `${Math.round(career.progress * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-mute">
                    Sonraki basamak: {career.next.title} ({formatCompactMoney(career.next.from)} net değer)
                  </p>
                </div>
              )}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-sm text-mute">Kasa</div>
              <div className="num text-2xl font-semibold text-amber">{formatMoney(company.cash)}</div>
              <div className="num mt-1 text-xs text-mute">Net değer {formatCompactMoney(state.netWorth)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm sm:hidden">
            <span className="text-mute">Kasa</span>
            <span className="num font-semibold text-amber">{formatMoney(company.cash)}</span>
          </div>
        </header>

        <nav className="mb-5 grid grid-cols-4 border-b border-line text-sm" aria-label="Bölümler">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`-mb-px border-b-2 py-2.5 font-medium transition-colors ${tab === k ? "border-amber text-white" : "border-transparent text-mute hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "ofis" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <p className="font-serif text-lg italic leading-relaxed text-white/85">{career.stage.scene}</p>

              <section className="card p-5">
                <h2 className="text-sm text-mute">Muhasebe</h2>
                <div className="num mt-1 text-4xl font-semibold text-gain">{formatMoney(pending)}</div>
                <p className="mt-2 text-sm text-mute">
                  {rate === 0
                    ? "Henüz gelir getiren bir donanımın yok. Donanım bölümünden ilk bilgisayarını al."
                    : capped
                    ? `Kasa ${OFFLINE_CAP_HOURS} saatlik tahsilat sınırına ulaştı. Tahsilat yapmazsan yeni gelir birikmez.`
                    : `Son tahsilattan bu yana biriken gelir. En fazla ${OFFLINE_CAP_HOURS} saatlik gelir bekletilebilir.`}
                </p>
                <button
                  className="btn btn-primary mt-4 w-full sm:w-auto"
                  disabled={busy || pending <= 0}
                  onClick={() => act("/api/company/collect", {}, (r) => `Tahsilat yapıldı: ${formatMoney(r.collected)}`)}
                >
                  Tahsilat yap
                </button>
              </section>

              <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line bg-panel">
                <Figure label="Saatlik gelir" value={formatMoney(rate)} />
                <Figure label="Portföy" value={formatCompactMoney(state.portfolioValue ?? 0)} />
                <Figure label="Net değer" value={formatCompactMoney(state.netWorth)} />
              </dl>

              <section className="card">
                <h2 className="border-b border-line px-5 py-3 font-serif font-semibold">Donanım parkı</h2>
                {Object.keys(owned).length === 0 ? (
                  <p className="px-5 py-4 text-sm text-mute">Ofiste henüz çalışan bir makine yok.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {EQUIPMENT.filter((e) => owned[e.id]).map((e) => (
                      <li key={e.id} className="flex justify-between px-5 py-2.5">
                        <span>{e.name}</span>
                        <span className="num text-mute">
                          {owned[e.id]} adet, saatte {formatMoney(e.incomePerHour * owned[e.id])}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="card self-start">
              <h2 className="border-b border-line px-5 py-3 font-serif font-semibold">Şirket günlüğü</h2>
              {journal.length === 0 ? (
                <p className="px-5 py-4 text-sm text-mute">Kayıtlar burada görünecek: tahsilatlar, satın almalar ve yatırımlar.</p>
              ) : (
                <ol className="relative px-5 py-4">
                  <div className="absolute bottom-6 left-[27px] top-6 w-px bg-line" aria-hidden="true" />
                  {journal.map((j) => (
                    <li key={j.id} className="relative mb-4 flex gap-3 last:mb-0">
                      <span
                        className={`relative z-[1] mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-panel ${
                          j.kind === "founded" ? "bg-amber" : j.amount && j.amount > 0 ? "bg-gain" : j.amount && j.amount < 0 ? "bg-loss" : "bg-mute"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{j.text}</p>
                        <p className="mt-0.5 text-xs text-mute">{ago(now + skew - new Date(j.at).getTime())}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

        {tab === "donanim" && (
          <div>
            <p className="mb-4 max-w-2xl text-sm text-mute">
              Her makine saatlik gelir getirir. Aynı makineden aldıkça fiyatı yükselir. Bir üst kademe, bir alttakinden en az bir tane aldığında açılır.
            </p>
            <ul className="space-y-3">
              {EQUIPMENT.map((e) => {
                const qty = owned[e.id] ?? 0;
                const cost = unitCost(e.id, qty);
                const afford = company.cash >= cost;
                const prev = EQUIPMENT.find((x) => x.tier === e.tier - 1);
                const locked = !!prev && (owned[prev.id] ?? 0) < 1;
                return (
                  <li key={e.id} className={`card flex items-center gap-4 p-4 ${locked ? "opacity-50" : ""}`}>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-amber/40 font-serif text-lg text-amber">{e.tier}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {e.name}
                        {qty > 0 && <span className="num ml-2 text-sm text-mute">{qty} adet</span>}
                      </div>
                      <div className="text-sm text-mute">{locked ? `Açmak için önce bir ${prev!.name} al.` : e.desc}</div>
                      <div className="num mt-1 text-sm text-gain">Saatte +{formatMoney(e.incomePerHour)}</div>
                    </div>
                    <button
                      className="btn btn-primary shrink-0"
                      disabled={busy || locked || !afford}
                      onClick={() => act("/api/company/buy", { equipmentId: e.id }, () => `${e.name} satın alındı`)}
                      aria-label={`${e.name} satın al, ${formatMoney(cost)}`}
                    >
                      <span className="num">{formatCompactMoney(cost)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === "borsa" && <Market cash={company.cash} holdings={state.holdings ?? {}} onState={apply} notify={setToast} />}

        {tab === "sektor" && (
          <section className="card">
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
              <h2 className="font-serif font-semibold">Sektör sıralaması</h2>
              {board && <span className="text-sm text-mute">{board.me ? `Sıran: ${board.me.rank} / ${board.total}` : `${board.total} şirket`}</span>}
            </div>
            {!board ? (
              <p className="px-5 py-4 text-sm text-mute">Liste hazırlanıyor…</p>
            ) : (
              <ol className="divide-y divide-line">
                {board.top.map((c) => (
                  <li key={c.id} className={`flex items-center gap-4 px-5 py-3 ${c.isMe ? "bg-amber/[0.06]" : ""}`}>
                    <span className={`num w-7 text-right font-serif text-lg ${c.rank <= 3 ? "text-amber" : "text-mute"}`}>{c.rank}</span>
                    <CompanyMark spec={c.logo} url={c.logoUrl} size={36} title={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {c.name}
                        {c.isMe && <span className="ml-2 text-xs text-amber">sen</span>}
                      </div>
                      <div className="truncate text-sm text-mute">
                        {c.founderName}, {stageFor(c.netWorth).stage.title}
                      </div>
                    </div>
                    <span className="num text-right font-medium">{formatCompactMoney(c.netWorth)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <footer className="mt-10 flex items-center justify-between border-t border-line pt-4 text-sm text-mute">
          <button onClick={logout} className="hover:text-white">
            Çıkış yap
          </button>
          {isAdmin && (
            <Link href="/admin" className="text-amber hover:text-amber-soft">
              Yönetici paneli
            </Link>
          )}
        </footer>

        {toast && (
          <div className="fixed inset-x-0 bottom-6 z-10 mx-auto w-fit max-w-[90vw] rounded border border-amber/40 bg-raised px-4 py-2.5 text-sm shadow-lg" role="status">
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="num mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
