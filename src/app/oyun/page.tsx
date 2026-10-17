"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { EQUIPMENT, OFFLINE_CAP_HOURS, type CharacterSpec, type LogoSpec } from "@/lib/game/config";
import { formatCompact, formatMoney, incomePerHour, pendingIncome, unitCost, type Owned } from "@/lib/game/economy";
import { apiFetch, supabaseBrowser } from "@/lib/supabase/client";
import { useRequireSession } from "@/lib/useSession";

type State = {
  hasCompany: true;
  isAdmin: boolean;
  company: { id: string; name: string; founderName: string; logo: LogoSpec; character: CharacterSpec; cash: number; lastCollectedAt: string };
  owned: Owned;
  incomePerHour: number;
  pending: number;
  netWorth: number;
  serverTime: number;
};

type Board = {
  total: number;
  top: { id: string; rank: number; name: string; founderName: string; logo: LogoSpec; netWorth: number; isMe: boolean }[];
  me: { rank: number; netWorth: number } | null;
};

type Tab = "genel" | "ekipman" | "siralama";

export default function Oyun() {
  const router = useRouter();
  const ready = useRequireSession();
  const [state, setState] = useState<State | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("genel");
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0); // sunucu saati - istemci saati
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState<Board | null>(null);

  const apply = useCallback((s: any) => {
    setState(s);
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
    if (tab !== "siralama" || !ready) return;
    const fetchBoard = () => apiFetch<Board>("/api/leaderboard").then(setBoard).catch(() => {});
    fetchBoard();
    const t = setInterval(fetchBoard, 20_000);
    return () => clearInterval(t);
  }, [tab, ready]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
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

  if (!ready || !state) return <div className="p-8 text-sm text-mute">Yükleniyor…</div>;

  const { company, owned } = state;
  const rate = incomePerHour(owned);
  const capped = rate > 0 && pending >= rate * OFFLINE_CAP_HOURS;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-4">
      <header className="card mb-4 flex items-center gap-3 p-3">
        <Logo spec={company.logo} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{company.name}</div>
          <div className="truncate text-xs text-mute">{company.founderName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-mute">Nakit</div>
          <div className="num text-lg font-semibold text-amber">{formatMoney(company.cash)}</div>
        </div>
      </header>

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-md border border-line bg-panel p-1 text-sm">
        {([["genel", "Genel"], ["ekipman", "Ekipman"], ["siralama", "Sıralama"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded py-2 font-medium ${tab === k ? "bg-raised text-white" : "text-mute"}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "genel" && (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="card overflow-hidden">
            <Avatar spec={company.character} size={240} />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Saatlik gelir" value={formatMoney(rate)} />
              <Stat label="Net değer" value={formatCompact(state.netWorth)} />
            </div>
            <div className="card p-4">
              <div className="text-[10px] uppercase tracking-wider text-mute">Biriken gelir</div>
              <div className="num my-1 text-3xl font-semibold text-gain">{formatMoney(pending)}</div>
              <div className="mb-3 text-xs text-mute">
                {rate === 0
                  ? "Gelir için önce ekipman satın al."
                  : capped
                  ? `Depo doldu (${OFFLINE_CAP_HOURS} saat sınırı). Toplamadan gelir birikmez.`
                  : `En fazla ${OFFLINE_CAP_HOURS} saatlik gelir birikir.`}
              </div>
              <button className="btn btn-primary w-full" disabled={busy || pending <= 0} onClick={() => act("/api/company/collect", {}, (r) => `+${formatMoney(r.collected)} toplandı`)}>
                Geliri topla
              </button>
            </div>
            <div className="card p-4">
              <div className="mb-2 text-sm font-semibold">Envanter</div>
              {Object.keys(owned).length === 0 ? (
                <p className="text-sm text-mute">Henüz ekipmanın yok. Ekipman sekmesinden ilk bilgisayarını al.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {EQUIPMENT.filter((e) => owned[e.id]).map((e) => (
                    <li key={e.id} className="flex justify-between py-2">
                      <span>{e.name}</span>
                      <span className="num text-mute">× {owned[e.id]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "ekipman" && (
        <ul className="space-y-3">
          {EQUIPMENT.map((e) => {
            const qty = owned[e.id] ?? 0;
            const cost = unitCost(e.id, qty);
            const afford = company.cash >= cost;
            // Bir önceki kademeden en az 1 adet olmadan sonraki açılmaz
            const prev = EQUIPMENT.find((x) => x.tier === e.tier - 1);
            const locked = !!prev && (owned[prev.id] ?? 0) < 1;
            return (
              <li key={e.id} className={`card flex items-center gap-3 p-4 ${locked ? "opacity-50" : ""}`}>
                <div className="num flex h-10 w-10 shrink-0 items-center justify-center rounded border border-line bg-ink text-sm text-amber">{e.tier}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {e.name} {qty > 0 && <span className="num text-xs text-mute">(×{qty})</span>}
                  </div>
                  <div className="text-xs text-mute">{locked ? `Kilidi aç: ${prev!.name}` : e.desc}</div>
                  <div className="num mt-1 text-xs text-gain">+{formatMoney(e.incomePerHour)} / saat</div>
                </div>
                <button
                  className="btn btn-primary shrink-0"
                  disabled={busy || locked || !afford}
                  onClick={() => act("/api/company/buy", { equipmentId: e.id }, () => `${e.name} satın alındı`)}
                >
                  <span className="num">{formatCompact(cost)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "siralama" && (
        <div className="card">
          {!board ? (
            <p className="p-4 text-sm text-mute">Yükleniyor…</p>
          ) : (
            <>
              <div className="flex justify-between border-b border-line px-4 py-3 text-xs text-mute">
                <span>{board.total} şirket</span>
                {board.me && <span>Senin sıran: #{board.me.rank}</span>}
              </div>
              <ol className="divide-y divide-line">
                {board.top.map((c) => (
                  <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.isMe ? "bg-amber/5" : ""}`}>
                    <span className="num w-7 text-sm text-mute">{c.rank}</span>
                    <Logo spec={c.logo} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="truncate text-xs text-mute">{c.founderName}</div>
                    </div>
                    <span className="num text-sm text-amber">{formatCompact(c.netWorth)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      <footer className="mt-8 flex items-center justify-between text-xs text-mute">
        <button onClick={logout} className="hover:text-white">Çıkış yap</button>
        {isAdmin && <Link href="/admin" className="text-amber">Yönetici paneli →</Link>}
      </footer>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-10 mx-auto w-fit max-w-[90vw] rounded-md border border-line bg-raised px-4 py-2.5 text-sm shadow-lg" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
