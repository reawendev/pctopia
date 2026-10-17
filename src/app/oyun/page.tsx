"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Feed } from "@/components/Feed";
import { Icon } from "@/components/Icon";
import { Life } from "@/components/Life";
import { Mailbox, type InboxData } from "@/components/Mailbox";
import { Market } from "@/components/Market";
import { CompanyMark, Portrait } from "@/components/Portrait";
import { Ticker } from "@/components/Ticker";
import { Workshop } from "@/components/Workshop";
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
  reputation: number;
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

type BoardRow = { id: string; rank: number; name: string; founderName: string; logo: LogoSpec; logoUrl: string | null; netWorth: number; reputation: number; isMe: boolean };
type Board = { total: number; top: BoardRow[]; me: { rank: number; netWorth: number } | null };

type Tab = "ofis" | "uretim" | "borsa" | "posta" | "hayat" | "gundem";
const TABS: [Tab, string][] = [
  ["ofis", "Ofis"],
  ["uretim", "Üretim"],
  ["borsa", "Borsa"],
  ["posta", "Posta"],
  ["hayat", "Hayat"],
  ["gundem", "Gündem"],
];

function repTone(r: number) {
  return r >= 65 ? "text-gain" : r < 40 ? "text-loss" : "text-white";
}

export default function Oyun() {
  const router = useRouter();
  const ready = useRequireSession();
  const [state, setState] = useState<State | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("ofis");
  const [sub, setSub] = useState<{ uretim: "donanim" | "atolye"; gundem: "akis" | "siralama" }>({ uretim: "donanim", gundem: "akis" });
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0); // sunucu saati - istemci saati
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [inbox, setInbox] = useState<InboxData | null>(null);

  const apply = useCallback((s: any) => {
    if (!s?.company) return;
    setState(s);
    if (Array.isArray(s.journal)) setJournal(s.journal);
    if (s.serverTime) setSkew(s.serverTime - Date.now());
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

  // 30 sn'de bir: teklifler, PC satışları; bir şey değiştiyse kasayı yenile
  const loadInbox = useCallback(async () => {
    const d = await apiFetch<InboxData>("/api/inbox");
    setInbox(d);
    if (d.changed) await load();
  }, [load]);

  useEffect(() => {
    if (ready) load().catch((e) => setToast(e.message));
  }, [ready, load]);

  const hasState = !!state;
  useEffect(() => {
    if (!ready || !hasState) return;
    loadInbox().catch(() => {});
    const t = setInterval(() => loadInbox().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [ready, hasState, loadInbox]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const showBoard = tab === "gundem" && sub.gundem === "siralama";
  useEffect(() => {
    if (!showBoard || !ready) return;
    const fetchBoard = () => apiFetch<Board>("/api/leaderboard").then(setBoard).catch(() => {});
    fetchBoard();
    const t = setInterval(fetchBoard, 20_000);
    return () => clearInterval(t);
  }, [showBoard, ready]);

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
  const serverNow = now + skew;
  const unread = inbox ? inbox.unread.offers + inbox.unread.messages : 0;
  const waiting = inbox ? inbox.offers.filter((o) => o.status === "open").length : 0;
  const rep = company.reputation ?? 50;

  return (
    <div className="pb-24 lg:pb-10">
      {/* Sabit üst bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <div className="shrink-0 overflow-hidden rounded-sm border border-amber/50">
            <Portrait spec={company.character} url={company.portraitUrl} size={36} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <CompanyMark spec={company.logo} url={company.logoUrl} size={16} title={company.name} />
              <span className="truncate text-sm font-medium">{company.name}</span>
            </div>
            <div className="truncate text-xs text-mute">
              {company.founderName}, <span className="text-amber-soft">{career.stage.title}</span>
              {day ? `, ${day}. gün` : ""}
            </div>
          </div>
          <dl className="num flex shrink-0 items-center gap-4 text-right">
            <div className="hidden sm:block">
              <dt className="text-[11px] text-mute">Net değer</dt>
              <dd className="text-sm">{formatCompactMoney(state.netWorth)}</dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-[11px] text-mute">İtibar</dt>
              <dd className={`text-sm ${repTone(rep)}`}>{rep}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-mute">Kasa</dt>
              <dd className="text-sm font-semibold text-amber">{formatMoney(company.cash)}</dd>
            </div>
          </dl>
        </div>
        {/* Masaüstü sekmeler */}
        <nav className="mx-auto hidden max-w-6xl px-4 lg:flex" aria-label="Bölümler">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors ${tab === k ? "border-amber text-white" : "border-transparent text-mute hover:text-white"}`}
            >
              <Icon name={k} className="h-4 w-4" />
              {label}
              {k === "posta" && unread > 0 && <Badge n={unread} />}
            </button>
          ))}
        </nav>
      </header>
      <Ticker />

      <main className="mx-auto max-w-6xl px-4 pt-4">
        {tab === "ofis" && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-3">
              <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-mute">Muhasebe: tahsil edilmeyi bekleyen</div>
                  <div className="num text-3xl font-semibold text-gain">{formatMoney(pending)}</div>
                  <div className="text-xs text-mute">
                    {rate === 0
                      ? "Gelir getiren bir donanımın yok. Üretim sekmesinden ilk makineni al."
                      : capped
                      ? `${OFFLINE_CAP_HOURS} saatlik sınır doldu; tahsilat yapmazsan yeni gelir birikmez.`
                      : `Saatte ${formatMoney(rate)}, en fazla ${OFFLINE_CAP_HOURS} saat birikir.`}
                  </div>
                </div>
                <button className="btn btn-primary" disabled={busy || pending <= 0} onClick={() => act("/api/company/collect", {}, (r) => `Tahsilat yapıldı: ${formatMoney(r.collected)}`)}>
                  Tahsilat yap
                </button>
              </section>

              {waiting > 0 && (
                <button onClick={() => setTab("posta")} className="card flex w-full items-center justify-between gap-3 border-amber/40 px-4 py-3 text-left text-sm hover:border-amber">
                  <span>
                    Masanda yanıt bekleyen <span className="font-semibold text-amber">{waiting}</span> iş teklifi var.
                  </span>
                  <span className="text-amber">Postayı aç</span>
                </button>
              )}

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
                <Figure label="Saatlik gelir" value={formatMoney(rate)} />
                <Figure label="Portföy" value={formatCompactMoney(state.portfolioValue ?? 0)} />
                <Figure label="Net değer" value={formatCompactMoney(state.netWorth)} />
                <Figure label="İtibar" value={`${rep} / 100`} tone={repTone(rep)} />
              </dl>

              <section className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-amber-soft">{career.stage.title}</span>
                  {career.next && <span className="text-xs text-mute">Sonraki: {career.next.title}, {formatCompactMoney(career.next.from)}</span>}
                </div>
                {career.next && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink">
                    <div className="h-full rounded-full bg-amber" style={{ width: `${Math.round(career.progress * 100)}%` }} />
                  </div>
                )}
                <p className="mt-2 font-serif text-[15px] italic text-white/80">{career.stage.scene}</p>
              </section>

              <section className="card">
                <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                  <h2 className="font-serif font-semibold">Donanım parkı</h2>
                  <button className="text-xs text-amber hover:text-amber-soft" onClick={() => (setTab("uretim"), setSub((s) => ({ ...s, uretim: "donanim" })))}>
                    Makine al
                  </button>
                </div>
                {Object.keys(owned).length === 0 ? (
                  <p className="px-4 py-3 text-sm text-mute">Ofiste henüz çalışan bir makine yok.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {EQUIPMENT.filter((e) => owned[e.id]).map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 px-4 py-2">
                        <span className="truncate">{e.name}</span>
                        <span className="num shrink-0 text-mute">
                          {owned[e.id]} adet, saatte {formatMoney(e.incomePerHour * owned[e.id])}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="card self-start">
              <h2 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Şirket günlüğü</h2>
              {journal.length === 0 ? (
                <p className="px-4 py-3 text-sm text-mute">Tahsilatlar, satın almalar, satışlar ve hayatındaki gelişmeler burada.</p>
              ) : (
                <ol className="max-h-[560px] divide-y divide-line overflow-y-auto">
                  {journal.map((j) => (
                    <li key={j.id} className="flex gap-2.5 px-4 py-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          j.kind === "founded" ? "bg-amber" : j.kind === "life" ? "bg-[#C98BC9]" : j.amount && j.amount > 0 ? "bg-gain" : j.amount && j.amount < 0 ? "bg-loss" : "bg-mute"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{j.text}</p>
                        <p className="text-[11px] text-mute">{ago(serverNow - new Date(j.at).getTime())}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

        {tab === "uretim" && (
          <div className="space-y-3">
            <Segmented
              value={sub.uretim}
              options={[
                ["donanim", "Donanım (gelir makineleri)"],
                ["atolye", "PC Atölyesi"],
              ]}
              onChange={(v) => setSub((s) => ({ ...s, uretim: v as any }))}
            />
            {sub.uretim === "donanim" ? (
              <ul className="card divide-y divide-line">
                {EQUIPMENT.map((e) => {
                  const qty = owned[e.id] ?? 0;
                  const cost = unitCost(e.id, qty);
                  const prev = EQUIPMENT.find((x) => x.tier === e.tier - 1);
                  const locked = !!prev && (owned[prev.id] ?? 0) < 1;
                  return (
                    <li key={e.id} className={`flex items-center gap-3 px-4 py-3 ${locked ? "opacity-50" : ""}`}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-amber/40 font-serif text-amber">{e.tier}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {e.name}
                          {qty > 0 && <span className="num ml-2 text-xs text-mute">{qty} adet</span>}
                        </div>
                        <div className="truncate text-xs text-mute">{locked ? `Açmak için önce bir ${prev!.name} al.` : e.desc}</div>
                      </div>
                      <span className="num hidden shrink-0 text-sm text-gain sm:block">saatte +{formatMoney(e.incomePerHour)}</span>
                      <button
                        className="btn btn-primary shrink-0 !px-3 !py-2"
                        disabled={busy || locked || company.cash < cost}
                        onClick={() => act("/api/company/buy", { equipmentId: e.id }, () => `${e.name} satın alındı`)}
                        aria-label={`${e.name} satın al, ${formatMoney(cost)}`}
                      >
                        <span className="num">{formatCompactMoney(cost)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Workshop cash={company.cash} stageLevel={career.stage.level} onState={apply} notify={setToast} />
            )}
          </div>
        )}

        {tab === "borsa" && <Market cash={company.cash} holdings={state.holdings ?? {}} onState={apply} notify={setToast} />}

        {tab === "posta" && <Mailbox data={inbox} cash={company.cash} now={serverNow} reload={loadInbox} onState={apply} notify={setToast} />}

        {tab === "hayat" && <Life cash={company.cash} now={serverNow} onState={apply} notify={setToast} />}

        {tab === "gundem" && (
          <div className="space-y-3">
            <Segmented
              value={sub.gundem}
              options={[
                ["akis", "Sosyal medya"],
                ["siralama", "Sektör sıralaması"],
              ]}
              onChange={(v) => setSub((s) => ({ ...s, gundem: v as any }))}
            />
            {sub.gundem === "akis" ? (
              <Feed now={serverNow} />
            ) : (
              <section className="card">
                <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                  <h2 className="font-serif font-semibold">Sektör sıralaması</h2>
                  {board && <span className="text-sm text-mute">{board.me ? `Sıran: ${board.me.rank} / ${board.total}` : `${board.total} şirket`}</span>}
                </div>
                {!board ? (
                  <p className="px-4 py-3 text-sm text-mute">Liste hazırlanıyor…</p>
                ) : (
                  <ol className="divide-y divide-line">
                    {board.top.map((c) => (
                      <li key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${c.isMe ? "bg-amber/[0.06]" : ""}`}>
                        <span className={`num w-6 text-right font-serif ${c.rank <= 3 ? "text-amber" : "text-mute"}`}>{c.rank}</span>
                        <CompanyMark spec={c.logo} url={c.logoUrl} size={28} title={c.name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {c.name}
                            {c.isMe && <span className="ml-2 text-xs text-amber">sen</span>}
                          </div>
                          <div className="truncate text-xs text-mute">
                            {c.founderName}, {stageFor(c.netWorth).stage.title}
                          </div>
                        </div>
                        <span className={`num hidden w-16 text-right text-xs sm:block ${repTone(c.reputation)}`}>itibar {c.reputation}</span>
                        <span className="num w-24 text-right text-sm font-medium">{formatCompactMoney(c.netWorth)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-line pt-3 text-sm text-mute">
          <button onClick={logout} className="hover:text-white">
            Çıkış yap
          </button>
          {isAdmin && (
            <Link href="/admin" className="text-amber hover:text-amber-soft">
              Yönetici paneli
            </Link>
          )}
        </footer>
      </main>

      {/* Mobil alt gezinme */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Bölümler">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => (setTab(k), window.scrollTo({ top: 0 }))}
            aria-current={tab === k ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === k ? "text-amber" : "text-mute"}`}
          >
            <Icon name={k} />
            {label}
            {k === "posta" && unread > 0 && (
              <span className="absolute right-[18%] top-1">
                <Badge n={unread} />
              </span>
            )}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto w-fit max-w-[90vw] rounded border border-amber/40 bg-raised px-4 py-2.5 text-sm shadow-lg lg:bottom-6" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="num inline-flex min-w-[16px] items-center justify-center rounded-full bg-amber px-1 text-[10px] font-semibold leading-4 text-ink" aria-label={`${n} okunmamış`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-panel p-0.5 text-sm" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`rounded px-3 py-1.5 ${value === k ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-panel px-4 py-2.5">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`num font-semibold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
