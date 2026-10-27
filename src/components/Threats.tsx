"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompanyMark } from "./Portrait";
import type { LogoSpec } from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import { REPORT_CATCH } from "@/lib/game/blackmail";
import { apiFetch } from "@/lib/supabase/client";
import { ago } from "@/lib/time";

type Party = { id: string; name: string; founderName: string; logo: LogoSpec | null; logoUrl: string | null } | null;
type Fx = { rep: number; demand: number; hours: number };
export type Threat = {
  id: string;
  side: "in" | "out";
  other: Party;
  severity: 1 | 2 | 3;
  severityLabel: string;
  summary: string;
  demandKind: "cash" | "shares" | "tender";
  demandLabel: string;
  demand: string;
  amount: number;
  shares: number;
  note: string | null;
  status: "open" | "paid" | "refused" | "reported" | "countered" | "expired" | "caught";
  outcome: string;
  counterTried: boolean;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  read: boolean;
  exposure: Fx;
  exposureSelf: Fx;
};
export type DossierItem = {
  id: number;
  target?: Party;
  severity: 1 | 2 | 3;
  severityLabel: string;
  summary: string;
  freshness: number;
  value: number;
  expiresAt: string;
  status: "active" | "pledged" | "used" | "burned";
  cooldownUntil: string | null;
};
type Data = { ready: boolean; incoming: Threat[]; outgoing: Threat[]; dossiers: DossierItem[]; canCounter: boolean; open: number };

export const SEV_TONE: Record<number, string> = { 1: "border-amber/40 text-amber-soft", 2: "border-amber text-amber", 3: "border-loss text-loss" };

export function left(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} sa ${m % 60} dk` : `${Math.floor(h / 24)} gün ${h % 24} sa`;
}

function fxText(f: Fx) {
  return `itibar ${f.rep}, PC talebi ${f.hours} saat %${Math.round(-f.demand * 100)} düşer`;
}

export function SeverityBadge({ s, label }: { s: number; label: string }) {
  return <span className={`rounded border px-1.5 text-[11px] font-medium ${SEV_TONE[s]}`}>{label}</span>;
}

/** Posta sekmesinin üstünde: isimsiz zarflar, gönderdiğin zarflar ve elindeki dosyalar. */
export function Threats({
  cash,
  now,
  openCount,
  reload,
  onState,
  notify,
}: {
  cash: number;
  now: number;
  openCount: number;
  reload: () => Promise<void>;
  onState: (s: any) => void;
  notify: (m: string) => void;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"dosya" | "giden" | "gecmis">("dosya");
  const [last, setLast] = useState<string>("");
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/blackmail")), []);

  // Rozet değişince (yeni zarf geldi ya da süresi doldu) tazele
  useEffect(() => {
    load().catch(() => {});
  }, [load, openCount]);

  // Görülen zarflar okundu sayılır
  const unseen = d?.incoming.some((t) => t.status === "open" && !t.read);
  useEffect(() => {
    if (unseen) apiFetch("/api/blackmail", { method: "POST", body: JSON.stringify({ action: "read" }) }).catch(() => {});
  }, [unseen]);

  async function act(t: Threat, action: "pay" | "refuse" | "report" | "counter") {
    const ask: Record<typeof action, string> = {
      pay: `İstenen ödensin mi? (${t.demand})`,
      refuse: `Reddedersen dosya basına sızar: ${fxText(t.exposure)}. Emin misin?`,
      report: `İhbar edersen sırrı kendin açıklarsın (${fxText(t.exposureSelf)}). Şantajcı büyük olasılıkla yakalanır. Devam edilsin mi?`,
      counter: "Elindeki dosyalardan biri zarfın sahibine aitse iki taraf da geri çekilir. Tutmazsa bu hakkı kaybedersin. Denensin mi?",
    };
    if (!window.confirm(ask[action])) return;
    setBusy(t.id + action);
    try {
      const r = await apiFetch<any>("/api/blackmail", { method: "POST", body: JSON.stringify({ action, id: t.id }) });
      if (r.inbox) setD(r.inbox);
      onState(r.state);
      setLast(r.message);
      reload().catch(() => {});
    } catch (e: any) {
      notify(e.message);
      load().catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  if (!d || !d.ready) return null;
  const open = d.incoming.filter((t) => t.status === "open");
  const past = d.incoming.filter((t) => t.status !== "open");
  if (!open.length && !past.length && !d.outgoing.length && !d.dossiers.length && !last) return null;

  return (
    <div className="space-y-3">
      {open.map((t) => {
        const cantPay = t.demandKind === "cash" && cash < t.amount;
        return (
          <section key={t.id} className="card border-loss/60" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
              <h2 className="font-serif font-semibold">İsimsiz bir zarf</h2>
              <span className="num text-xs text-amber">{left(new Date(t.expiresAt).getTime() - now)} içinde yanıt ver</span>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm">
              <p>
                Biri hakkında bir dosya tuttuğunu söylüyor: <span className="font-medium text-white">“{t.summary}”</span> <SeverityBadge s={t.severity} label={t.severityLabel} />
              </p>
              {t.note && <blockquote className="border-l-2 border-line pl-3 font-serif italic text-white/85">{t.note}</blockquote>}
              <p>
                Karşılığında istediği: <span className="font-semibold text-amber">{t.demand}</span>
              </p>
              <ul className="space-y-0.5 text-xs text-mute">
                <li>Reddedersen ya da yanıt vermezsen dosya basına sızar: {fxText(t.exposure)}.</li>
                <li>İhbar edersen sırrı kendin açıklarsın; etkisi yarıya iner ({fxText(t.exposureSelf)}). Şantajcının yakalanma olasılığı yaklaşık %{Math.round(REPORT_CATCH * 100)}.</li>
                {d.canCounter && !t.counterTried && <li>Elinde dosyalar var. Biri zarfın sahibine aitse karşı tehditle iki taraf da geri çekilir.</li>}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              <button className="btn btn-primary !py-1.5 text-sm" disabled={!!busy || cantPay} onClick={() => act(t, "pay")} title={cantPay ? "Kasada yeterli para yok" : undefined}>
                Öde
              </button>
              <button className="btn !py-1.5 text-sm" disabled={!!busy} onClick={() => act(t, "refuse")}>
                Reddet
              </button>
              <button className="btn !py-1.5 text-sm" disabled={!!busy} onClick={() => act(t, "report")}>
                İhbar et
              </button>
              {d.canCounter && !t.counterTried && (
                <button className="btn !py-1.5 text-sm" disabled={!!busy} onClick={() => act(t, "counter")}>
                  Karşı tehdit
                </button>
              )}
            </div>
          </section>
        );
      })}

      {last && <p className="card px-4 py-2.5 text-sm text-amber">{last}</p>}

      {(past.length > 0 || d.outgoing.length > 0 || d.dossiers.length > 0) && (
        <section className="card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h2 className="px-1 font-serif font-semibold">Kozlar</h2>
            <div className="flex gap-1 text-sm" role="tablist">
              {(
                [
                  ["dosya", `Dosyalar${d.dossiers.length ? ` (${d.dossiers.length})` : ""}`],
                  ["giden", "Gönderdiklerin"],
                  ["gecmis", "Gelenler"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded px-2.5 py-1 ${view === k ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {view === "dosya" &&
            (d.dossiers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-mute">Elinde dosya yok. Bir rakibin profilinden özel dedektif tutarak kirli işlerini araştırabilirsin.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.dossiers.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                    {x.target && (x.target.logo || x.target.logoUrl) && <CompanyMark spec={x.target.logo as LogoSpec} url={x.target.logoUrl} size={24} title={x.target.name} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {x.target ? (
                          <Link href={`/sirket/${x.target.id}`} className="font-medium hover:text-amber">
                            {x.target.name}
                          </Link>
                        ) : (
                          "Kapanmış şirket"
                        )}{" "}
                        <SeverityBadge s={x.severity} label={x.severityLabel} />
                      </div>
                      <div className="truncate text-xs text-mute">{x.summary}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-ink" aria-hidden>
                          <span className="block h-full rounded-full bg-amber" style={{ width: `${Math.round(x.freshness * 100)}%` }} />
                        </span>
                        <span className="text-[11px] text-mute">
                          {x.status === "pledged" ? "Açık bir zarfta" : x.cooldownUntil ? `Kopya, ${left(new Date(x.cooldownUntil).getTime() - now)} sonra kullanılabilir` : `${left(new Date(x.expiresAt).getTime() - now)} sonra bayatlar`}
                        </span>
                      </div>
                    </div>
                    <span className="num shrink-0 text-sm">{formatMoney(x.value)}</span>
                  </li>
                ))}
              </ul>
            ))}

          {view !== "dosya" && <History list={view === "giden" ? d.outgoing : past} now={now} empty={view === "giden" ? "Henüz kimseye zarf göndermedin." : "Sana gelen bir zarf olmadı."} />}
        </section>
      )}
    </div>
  );
}

function History({ list, now, empty }: { list: Threat[]; now: number; empty: string }) {
  if (!list.length) return <p className="px-4 py-3 text-sm text-mute">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {list.map((t) => (
        <li key={t.id} className="px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 truncate">
              {t.side === "out" ? (t.other ? <Link href={`/sirket/${t.other.id}`} className="font-medium hover:text-amber">{t.other.name}</Link> : "Kapanmış şirket") : t.other ? <Link href={`/sirket/${t.other.id}`} className="font-medium hover:text-amber">{t.other.name}</Link> : <span className="font-medium">İsimsiz</span>}
              <span className="text-mute">: {t.demand}</span>
            </span>
            <span className="shrink-0 text-xs text-mute">{ago(now - new Date(t.resolvedAt ?? t.createdAt).getTime())}</span>
          </div>
          <div className="truncate text-xs text-mute">“{t.summary}”</div>
          <div className={`text-xs ${t.status === "open" ? "text-amber" : t.status === "paid" ? (t.side === "out" ? "text-gain" : "text-loss") : t.status === "caught" && t.side === "out" ? "text-loss" : "text-white/80"}`}>
            {t.status === "open" && t.side === "out" ? `Yanıt bekleniyor, ${left(new Date(t.expiresAt).getTime() - now)} kaldı` : t.outcome}
          </div>
        </li>
      ))}
    </ul>
  );
}
