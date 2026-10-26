"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Appearance } from "@/components/Appearance";
import { Club } from "@/components/Club";
import { Facility } from "@/components/Facility";
import { Feed } from "@/components/Feed";
import { Finance } from "@/components/Finance";
import { Properties } from "@/components/Properties";
import { Research } from "@/components/Research";
import { Tenders } from "@/components/Tenders";
import { Icon } from "@/components/Icon";
import { Life } from "@/components/Life";
import { Mailbox, type InboxData } from "@/components/Mailbox";
import { Market } from "@/components/Market";
import { CompanyMark, Portrait } from "@/components/Portrait";
import { Ticker } from "@/components/Ticker";
import { Workshop } from "@/components/Workshop";
import { HallOfFame, WorldCard, type WorldData } from "@/components/World";
import { EQUIPMENT, OFFLINE_CAP_HOURS, type CharacterSpec, type LogoSpec } from "@/lib/game/config";
import { formatCompactMoney, formatMoney, incomePerHour, pendingIncome, unitCost, type Owned } from "@/lib/game/economy";
import type { Holdings } from "@/lib/game/market";
import { dayNumber, stageFor } from "@/lib/game/stages";
import { apiFetch, supabaseBrowser } from "@/lib/supabase/client";
import { ago } from "@/lib/time";
import { useRequireSession } from "@/lib/useSession";
import { Splash } from "@/components/Splash";
import { RollingNumber } from "@/components/RollingNumber";
import { useToasts } from "@/components/Toaster";
import { PushInvite, PushSetting, usePush } from "@/components/Notifications";
import { direction, useIsMobile, useSlidingIndicator, useSwipe } from "@/components/Motion";
import { SkeletonCard, SkeletonLines } from "@/components/Skeleton";

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
  capHours?: number;
  staff?: string[];
};

type BoardRow = { id: string; rank: number; name: string; founderName: string; logo: LogoSpec; logoUrl: string | null; netWorth: number; reputation: number; isMe: boolean; ownership?: number };
type Board = { total: number; top: BoardRow[]; me: { rank: number; netWorth: number } | null };

type Tab = "ofis" | "uretim" | "borsa" | "finans" | "posta" | "hayat" | "gundem";
const TABS: [Tab, string][] = [
  ["ofis", "Ofis"],
  ["uretim", "Üretim"],
  ["borsa", "Borsa"],
  ["finans", "Finans"],
  ["posta", "Posta"],
  ["hayat", "Hayat"],
  ["gundem", "Gündem"],
];

const TAB_ORDER = TABS.map(([k]) => k);

const URETIM_OPTS: [string, string][] = [
  ["donanim", "Donanım"],
  ["atolye", "PC Atölyesi"],
  ["ihale", "İhaleler"],
  ["arge", "Ar-Ge"],
];
const HAYAT_OPTS: [string, string][] = [
  ["iliskiler", "İlişkiler"],
  ["mulkler", "Mülkler"],
  ["kulup", "Kulüp"],
];
const GUNDEM_OPTS: [string, string][] = [
  ["akis", "Sosyal medya"],
  ["siralama", "Sıralama"],
  ["seref", "Şeref listesi"],
];
const keysOf = (o: [string, string][]) => o.map(([k]) => k);

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
  const [dir, setDir] = useState<1 | -1>(1);
  const [subDir, setSubDir] = useState<1 | -1>(1);
  const [sub, setSub] = useState<{ uretim: "donanim" | "atolye" | "ihale" | "arge"; gundem: "akis" | "siralama" | "seref"; hayat: "iliskiler" | "mulkler" | "kulup" }>({ uretim: "donanim", gundem: "akis", hayat: "iliskiler" });
  const [dealTo, setDealTo] = useState<string | null>(null);
  const [mailTo, setMailTo] = useState<string | null>(null);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0); // sunucu saati - istemci saati
  const [bootError, setBootError] = useState("");
  const { notify: setToast, node: toasts } = useToasts();
  const push = usePush(setToast);
  const [board, setBoard] = useState<Board | null>(null);
  const [inbox, setInbox] = useState<InboxData | null>(null);
  // Günlüğe yeni düşen kayıtlar kısa süre vurgulanır
  const seenJournal = useRef<Set<number> | null>(null);
  const [newJournal, setNewJournal] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!journal.length) return;
    const seen = seenJournal.current;
    seenJournal.current = new Set(journal.map((j) => j.id));
    if (!seen) return; // ilk yükleme: vurgu yok
    const fresh = journal.filter((j) => !seen.has(j.id)).map((j) => j.id);
    if (!fresh.length) return;
    setNewJournal(new Set(fresh));
    const t = setTimeout(() => setNewJournal(new Set()), 900);
    return () => clearTimeout(t);
  }, [journal]);

  // Sıralama: son bakıştan beri yükselen/düşen şirketler (tarayıcıda saklanan önceki sıralar)
  const rankBase = useRef<Record<string, number> | null>(null);
  // Karşılaştırma tabanı, liste ilk geldiği render'da okunur (kayıt efektte güncellenmeden önce)
  if (board && !rankBase.current) {
    try {
      rankBase.current = JSON.parse(localStorage.getItem("pct-ranks") || "{}");
    } catch {
      rankBase.current = {};
    }
  }
  useEffect(() => {
    if (!board) return;
    try {
      localStorage.setItem("pct-ranks", JSON.stringify(Object.fromEntries(board.top.map((c) => [c.id, c.rank]))));
    } catch {}
  }, [board]);

  // Telefonda sağa/sola kaydırarak sekme değiştir
  const isMobile = useIsMobile();
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const tabIdx = TAB_ORDER.indexOf(tab);
  useSwipe(
    mainEl,
    () => tabIdx < TAB_ORDER.length - 1 && (go(TAB_ORDER[tabIdx + 1]), window.scrollTo({ top: 0 })),
    () => tabIdx > 0 && (go(TAB_ORDER[tabIdx - 1]), window.scrollTo({ top: 0 })),
    isMobile
  );

  const deskInd = useSlidingIndicator(tab);
  const mobInd = useSlidingIndicator(tab);

  // Sekme değişimi: yön sekme sırasından gelir, içerik o yönden kayarak girer
  function go(k: Tab) {
    if (k === tab) return;
    setDir(direction(TAB_ORDER, tab, k));
    setTab(k);
  }

  function goSub<K extends keyof typeof sub>(key: K, v: (typeof sub)[K], order: readonly string[]) {
    if (sub[key] === v) return;
    setSubDir(direction(order, sub[key], v));
    setSub((s) => ({ ...s, [key]: v }));
  }

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
    if (ready) load().catch((e) => setBootError(e.message));
  }, [ready, load]);

  // Profil sayfasından gelen bağlantılar: ?sekme=finans&anlasma=<şirket>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("sekme") as Tab | null;
    if (t && TABS.some(([k]) => k === t)) setTab(t);
    const mt = q.get("kime");
    if (mt) {
      setTab("posta");
      setMailTo(mt);
    }
    const to = q.get("anlasma");
    if (to) {
      setTab("finans");
      setDealTo(to);
    }
  }, []);

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

  // Dünya gündemi ve sezon: dakikada bir
  useEffect(() => {
    if (!ready || !hasState) return;
    const f = () => apiFetch<WorldData>("/api/world").then(setWorld).catch(() => {});
    f();
    const t = setInterval(f, 60_000);
    return () => clearInterval(t);
  }, [ready, hasState]);

  const showBoard = tab === "gundem" && sub.gundem === "siralama";
  useEffect(() => {
    if (!showBoard || !ready) return;
    const fetchBoard = () => apiFetch<Board>("/api/leaderboard").then(setBoard).catch(() => {});
    fetchBoard();
    const t = setInterval(fetchBoard, 20_000);
    return () => clearInterval(t);
  }, [showBoard, ready]);


  const pending = useMemo(() => {
    if (!state) return 0;
    return pendingIncome(state.owned, new Date(state.company.lastCollectedAt).getTime(), now + skew, state.capHours ?? OFFLINE_CAP_HOURS);
  }, [state, now, skew]);

  // İyimser işlemler: ekran hemen güncellenir, istekler sırayla gider.
  // Kuyruktaki son istek dönünce sunucunun gerçek durumu uygulanır; hata olursa durum sunucudan yeniden okunur.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inflight = useRef(0);
  function act(path: string, body: object | undefined, okMsg: ((r: any) => string) | undefined, optimistic?: (s: State, at: number) => State) {
    if (optimistic) setState((s) => (s ? optimistic(s, Date.now() + skew) : s));
    inflight.current++;
    queue.current = queue.current.then(async () => {
      try {
        const r = await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
        inflight.current--;
        if (inflight.current === 0) apply(r);
        else if (Array.isArray(r.journal)) setJournal(r.journal);
        if (okMsg) setToast(okMsg(r));
      } catch (e: any) {
        inflight.current--;
        setToast(e.message);
        await load().catch(() => {});
      }
    });
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
  }

  // Perde her iki dalda da Fragment'in ilk çocuğu: React aynı örneği korur, kapanış animasyonu oyunun üstünde oynar
  const splash = <Splash key="splash" done={ready && !!state} error={!state ? bootError || undefined : undefined} />;
  if (!ready || !state) return <>{splash}</>;

  const { company, owned } = state;
  const rate = incomePerHour(owned);
  const cap = state.capHours ?? OFFLINE_CAP_HOURS;
  const capped = rate > 0 && pending >= rate * cap;
  const autoCollect = state.staff?.includes("muhasebeci");
  const career = stageFor(state.netWorth);
  const day = dayNumber(company.createdAt, now + skew);
  const serverNow = now + skew;
  const unread = inbox ? inbox.unread.offers + inbox.unread.messages : 0;
  const pendingDeals = inbox?.pendingDeals ?? 0;
  const waiting = inbox ? inbox.offers.filter((o) => o.status === "open").length : 0;
  const rep = company.reputation ?? 50;

  return (
    <>
    {splash}
    <div className="pb-24 lg:pb-10">
      {/* Sabit üst bar */}
      <header className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <div className="shrink-0 overflow-hidden rounded-sm border border-amber/50">
            <Portrait spec={company.character} url={company.portraitUrl} size={36} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <CompanyMark spec={company.logo} url={company.logoUrl} size={16} title={company.name} />
              <Link href={`/sirket/${company.id}`} className="truncate text-sm font-medium hover:text-amber">{company.name}</Link>
            </div>
            <div className="truncate text-xs text-mute">
              {company.founderName}, <span className="text-amber-soft">{career.stage.title}</span>
              {day ? `, ${day}. gün` : ""}
            </div>
          </div>
          <dl className="num flex shrink-0 items-center gap-4 text-right">
            <div className="hidden sm:block">
              <dt className="text-[11px] text-mute">Net değer</dt>
              <dd className="text-sm"><RollingNumber value={state.netWorth} format={formatCompactMoney} flash /></dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-[11px] text-mute">İtibar</dt>
              <dd className={`text-sm ${repTone(rep)}`}>{rep}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-mute">Kasa</dt>
              <dd className="text-sm font-semibold text-amber"><RollingNumber value={company.cash} format={formatMoney} flash delta /></dd>
            </div>
          </dl>
        </div>
        {/* Masaüstü sekmeler */}
        <nav ref={deskInd.ref} className="relative mx-auto hidden max-w-6xl px-4 lg:flex" aria-label="Bölümler">
          <span className="tab-indicator -bottom-px h-0.5 rounded-full bg-amber" style={deskInd.style} data-animate={deskInd.animate} aria-hidden />
          {TABS.map(([k, label]) => (
            <button
              key={k}
              data-key={k}
              onClick={() => go(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`tab-label flex items-center gap-1.5 px-4 pb-2.5 pt-2 text-sm ${tab === k ? "text-white" : "text-mute hover:text-white"}`}
            >
              <Icon name={k} className="h-4 w-4" />
              {label}
              {k === "posta" && unread > 0 && <Badge n={unread} />}
              {k === "finans" && pendingDeals > 0 && <Badge n={pendingDeals} />}
            </button>
          ))}
        </nav>
      </header>
      <Ticker eventTitle={world?.event.id !== "calm" ? world?.event.title : undefined} />

      <main ref={setMainEl} className="mx-auto max-w-6xl px-4 pt-4">
        {/* Sekme değişince yeniden bağlanır ve sekme yönünden kayarak girer */}
        <div key={tab} className="page-enter" data-dir={dir}>
        {tab === "ofis" && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="stagger space-y-3">
              {world && <WorldCard w={world} now={serverNow} />}
              <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-mute">Muhasebe: tahsil edilmeyi bekleyen</div>
                  <div className="text-3xl font-semibold text-gain"><RollingNumber value={pending} format={formatMoney} duration={500} /></div>
                  <div className="text-xs text-mute">
                    {rate === 0
                      ? "Gelir getiren bir donanımın yok. Üretim sekmesinden ilk makineni al."
                      : capped
                      ? `${cap} saatlik sınır doldu; tahsilat yapmazsan yeni gelir birikmez.`
                      : autoCollect
                      ? `Saatte ${formatMoney(rate)}. Muhasebecin 10 dakikada bir kendisi tahsil ediyor.`
                      : `Saatte ${formatMoney(rate)}, en fazla ${cap} saat birikir.`}
                  </div>
                </div>
                <button
                  className="btn btn-primary press"
                  disabled={pending <= 0}
                  onClick={() =>
                    act("/api/company/collect", {}, (r) => `Tahsilat yapıldı: ${formatMoney(r.collected)}`, (s, at) => ({
                      ...s,
                      company: { ...s.company, cash: s.company.cash + pending, lastCollectedAt: new Date(at).toISOString() },
                      netWorth: s.netWorth + pending,
                    }))
                  }
                >
                  Tahsilat yap
                </button>
              </section>

              {waiting > 0 && (
                <button onClick={() => go("posta")} className="card flex w-full items-center justify-between gap-3 border-amber/40 px-4 py-3 text-left text-sm hover:border-amber">
                  <span>
                    Masanda yanıt bekleyen <span className="font-semibold text-amber">{waiting}</span> iş teklifi var.
                  </span>
                  <span className="text-amber">Postayı aç</span>
                </button>
              )}

              <PushInvite push={push} />

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
                <Figure label="Saatlik gelir" value={<RollingNumber value={rate} format={formatMoney} flash />} />
                <Figure label="Portföy" value={<RollingNumber value={state.portfolioValue ?? 0} format={formatCompactMoney} flash />} />
                <Figure label="Net değer" value={<RollingNumber value={state.netWorth} format={formatCompactMoney} flash />} />
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

              <Facility cash={company.cash} now={serverNow} onState={apply} notify={setToast} />

              <Appearance character={company.character} logo={company.logo} portraitUrl={company.portraitUrl} logoUrl={company.logoUrl} onState={apply} notify={setToast} />

              <section className="card">
                <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                  <h2 className="font-serif font-semibold">Donanım parkı</h2>
                  <button className="text-xs text-amber hover:text-amber-soft" onClick={() => (go("uretim"), setSub((s) => ({ ...s, uretim: "donanim" })))}>
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
                    <li key={j.id} className={`flex gap-2.5 px-4 py-2 ${newJournal.has(j.id) ? "row-new" : ""}`}>
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
            <Segmented value={sub.uretim} options={URETIM_OPTS} onChange={(v) => goSub("uretim", v as any, keysOf(URETIM_OPTS))} />
            <div key={sub.uretim} className="page-enter-soft" data-dir={subDir}>
            {sub.uretim === "donanim" ? (
              <ul className="card stagger divide-y divide-line">
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
                        className="btn btn-primary press min-h-[44px] shrink-0 !px-3 !py-2"
                        disabled={locked || company.cash + pending < cost}
                        onClick={() =>
                          act("/api/company/buy", { equipmentId: e.id }, () => `${e.name} satın alındı`, (s, at) => ({
                            ...s,
                            // Sunucu da önce birikmiş geliri kasaya geçirir, sonra bedeli düşer
                            company: { ...s.company, cash: s.company.cash + pending - cost, lastCollectedAt: new Date(at).toISOString() },
                            owned: { ...s.owned, [e.id]: (s.owned[e.id] ?? 0) + 1 },
                          }))
                        }
                        aria-label={`${e.name} satın al, ${formatMoney(cost)}`}
                      >
                        <span className="num">{formatCompactMoney(cost)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : sub.uretim === "atolye" ? (
              <Workshop cash={company.cash} stageLevel={career.stage.level} onState={apply} notify={setToast} />
            ) : sub.uretim === "ihale" ? (
              <Tenders cash={company.cash} reputation={rep} now={serverNow} onState={apply} notify={setToast} />
            ) : (
              <Research cash={company.cash} now={serverNow} onState={apply} notify={setToast} />
            )}
            </div>
          </div>
        )}

        {tab === "borsa" && <Market cash={company.cash} holdings={state.holdings ?? {}} onState={apply} notify={setToast} />}

        {tab === "posta" && <Mailbox composeTo={mailTo} data={inbox} cash={company.cash} now={serverNow} reload={loadInbox} onState={apply} notify={setToast} />}

        {tab === "finans" && <Finance cash={company.cash} now={serverNow} onState={apply} notify={setToast} pendingDeals={pendingDeals} initialTo={dealTo} />}

        {tab === "hayat" && (
          <div className="space-y-3">
            <Segmented value={sub.hayat} options={HAYAT_OPTS} onChange={(v) => goSub("hayat", v as any, keysOf(HAYAT_OPTS))} />
            <div key={sub.hayat} className="page-enter-soft" data-dir={subDir}>
            {sub.hayat === "iliskiler" ? (
              <Life cash={company.cash} now={serverNow} onState={apply} notify={setToast} />
            ) : sub.hayat === "mulkler" ? (
              <Properties cash={company.cash} onState={apply} notify={setToast} />
            ) : (
              <Club cash={company.cash} now={serverNow} onState={apply} notify={setToast} />
            )}
            </div>
          </div>
        )}

        {tab === "gundem" && (
          <div className="space-y-3">
            <Segmented value={sub.gundem} options={GUNDEM_OPTS} onChange={(v) => goSub("gundem", v as any, keysOf(GUNDEM_OPTS))} />
            <div key={sub.gundem} className="page-enter-soft" data-dir={subDir}>
            {sub.gundem === "seref" ? (
              world ? <HallOfFame w={world} /> : <SkeletonCard label="Yükleniyor…" />
            ) : sub.gundem === "akis" ? (
              <Feed now={serverNow} />
            ) : (
              <section className="card">
                <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                  <h2 className="font-serif font-semibold">Sektör sıralaması</h2>
                  {board && <span className="text-sm text-mute">{board.me ? `Sıran: ${board.me.rank} / ${board.total}` : `${board.total} şirket`}</span>}
                </div>
                {!board ? (
                  <SkeletonLines label="Liste hazırlanıyor…" rows={6} />
                ) : (
                  <ol className="stagger divide-y divide-line">
                    {board.top.map((c) => (
                      <li key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${c.isMe ? "bg-amber/[0.06]" : ""}`}>
                        <span className={`num w-6 text-right font-serif ${c.rank <= 3 ? "text-amber" : "text-mute"}`}>{c.rank}</span>
                        <RankMove move={rankBase.current?.[c.id] ? rankBase.current[c.id] - c.rank : 0} />
                        <CompanyMark spec={c.logo} url={c.logoUrl} size={28} title={c.name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            <Link href={`/sirket/${c.id}`} className="hover:text-amber">
                              {c.name}
                            </Link>
                            {c.isMe && <span className="ml-2 text-xs text-amber">sen</span>}
                          </div>
                          <div className="truncate text-xs text-mute">
                            {c.founderName}, {stageFor(c.netWorth).stage.title}
                            {c.ownership !== undefined && c.ownership < 1 ? `, halka açık (kurucu %${Math.round(c.ownership * 100)})` : ""}
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
          </div>
        )}
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-3 text-sm text-mute">
          <button onClick={logout} className="hover:text-white">
            Çıkış yap
          </button>
          <PushSetting push={push} />
          {isAdmin && (
            <Link href="/admin" className="text-amber hover:text-amber-soft">
              Yönetici paneli
            </Link>
          )}
        </footer>
      </main>

      {/* Mobil alt gezinme */}
      <nav ref={mobInd.ref} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Bölümler">
        <span className="tab-indicator -top-px flex justify-center" style={mobInd.style} data-animate={mobInd.animate} aria-hidden>
          <span className="h-0.5 w-7 rounded-full bg-amber" />
        </span>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            data-key={k}
            onClick={() => (go(k), window.scrollTo({ top: 0 }))}
            aria-current={tab === k ? "page" : undefined}
            className={`tab-label relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${tab === k ? "text-amber" : "text-mute"}`}
          >
            <Icon name={k} />
            {label}
            {((k === "posta" && unread > 0) || (k === "finans" && pendingDeals > 0)) && (
              <span className="absolute right-[12%] top-1">
                <Badge n={k === "posta" ? unread : pendingDeals} />
              </span>
            )}
          </button>
        ))}
      </nav>

      {toasts}
    </div>
    </>
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
  const ind = useSlidingIndicator(value);
  return (
    <div ref={ind.ref} className="relative inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-panel p-0.5 text-sm" role="tablist">
      <span className="tab-indicator inset-y-0.5 rounded bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.35)]" style={ind.style} data-animate={ind.animate} aria-hidden />
      {options.map(([k, label]) => (
        <button
          key={k}
          data-key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`tab-label relative shrink-0 whitespace-nowrap rounded px-3.5 py-2 lg:px-3 lg:py-1.5 ${value === k ? "text-white" : "text-mute hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RankMove({ move }: { move: number }) {
  if (!move) return <span className="w-7" aria-hidden />;
  const up = move > 0;
  return (
    <span className={`num w-7 text-[11px] font-medium ${up ? "text-gain" : "text-loss"}`} aria-label={`${Math.abs(move)} sıra ${up ? "yükseldi" : "düştü"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

function Figure({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-panel px-4 py-2.5">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`num font-semibold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
