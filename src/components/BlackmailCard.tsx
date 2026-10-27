"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/game/economy";
import { MAX_GREED, sendCatchChance, type Severity } from "@/lib/game/blackmail";
import { apiFetch } from "@/lib/supabase/client";
import { left, SeverityBadge, type DossierItem } from "./Threats";

type Data = {
  ready: boolean;
  dossiers: DossierItem[];
  block: string | null;
  serial: boolean;
  sharePrice: number;
  maxShares: number;
  tenders: { id: string; label: string; bond: number; worth: number }[];
  rules: { maxGreed: number; minDemand: number; answerHours: number };
};
type Kind = "cash" | "shares" | "tender";

/** Profil sayfasında: bu şirkete ait dosyaların ve şantaj zarfı. */
export function BlackmailCard({ targetId, targetName, onDone }: { targetId: string; targetName: string; onDone?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>("cash");
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [tender, setTender] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await apiFetch<Data>(`/api/blackmail?target=${encodeURIComponent(targetId)}`);
    setD(r);
    if (r.ready) {
      const usable = r.dossiers.filter((x) => x.status === "active" && !x.cooldownUntil);
      setPick((p) => (p && usable.some((x) => x.id === p) ? p : usable[0]?.id ?? null));
    }
  }, [targetId]);
  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const dossier = d?.ready ? d.dossiers.find((x) => x.id === pick) : undefined;
  const worth = useMemo(() => {
    if (!d?.ready) return 0;
    if (kind === "cash") return Math.max(0, Math.round(Number(amount) || 0));
    if (kind === "shares") return Math.round((Math.floor(Number(shares) || 0)) * d.sharePrice);
    return d.tenders.find((t) => t.id === tender)?.worth ?? 0;
  }, [d, kind, amount, shares, tender]);

  if (!d || !d.ready) return null;

  const fair = dossier?.value ?? 0;
  const cap = fair * MAX_GREED;
  const chance = dossier ? sendCatchChance(dossier.severity as Severity, worth, fair, d.serial) : 0;
  const valid =
    !!dossier &&
    worth > 0 &&
    worth <= cap &&
    (kind !== "cash" || worth >= d.rules.minDemand) &&
    (kind !== "shares" || (Number(shares) >= 1 && Number(shares) <= d.maxShares)) &&
    (kind !== "tender" || !!tender);

  async function send() {
    if (!dossier) return;
    const what = kind === "cash" ? formatMoney(worth) : kind === "shares" ? `${shares} hisse` : `${d!.tenders.find((t) => t.id === tender)?.label} ihalesinden çekilmesi`;
    if (!window.confirm(`${targetName} şirketine isimsiz zarf gönderilsin mi? Talep: ${what}. Yolda yakalanma olasılığı %${Math.round(chance * 100)}.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<any>("/api/blackmail", {
        method: "POST",
        body: JSON.stringify({ action: "send", target: targetId, dossierId: dossier.id, kind, amount: Number(amount), shares: Number(shares), tenderId: tender, note }),
      });
      setMsg({ text: r.message, bad: !!r.caught });
      if (r.view) setD(r.view);
      setNote("");
      onDone?.();
    } catch (e: any) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="font-serif font-semibold">Şantaj</h2>
        <p className="text-xs text-mute">
          Elindeki dosyayla isimsiz bir zarf gönder. {targetName} {d.rules.answerHours} saat içinde öder, reddeder, ihbar eder ya da elinde senin dosyan varsa karşı tehdit eder. Reddederse dosya basına sızar.
        </p>
      </div>

      {msg && <p className={`border-b border-line px-4 py-2.5 text-sm ${msg.bad ? "text-loss" : "text-gain"}`}>{msg.text}</p>}

      {d.dossiers.length === 0 ? (
        <p className="px-4 py-3 text-sm text-mute">Bu şirket hakkında elinde dosya yok. Aşağıdaki gizli operasyonlardan özel dedektif tutarak kirli işlerini araştırabilirsin.</p>
      ) : (
        <>
          <fieldset className="divide-y divide-line">
            <legend className="sr-only">Dosya seç</legend>
            {d.dossiers.map((x) => {
              const usable = x.status === "active" && !x.cooldownUntil;
              return (
                <label key={x.id} className={`flex items-center gap-3 px-4 py-2.5 ${usable ? "cursor-pointer" : "opacity-60"}`}>
                  <input type="radio" name="dossier" className="accent-[#C9A24A]" disabled={!usable} checked={pick === x.id} onChange={() => setPick(x.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      “{x.summary}” <SeverityBadge s={x.severity} label={x.severityLabel} />
                    </div>
                    <div className="text-xs text-mute">
                      {x.status === "pledged" ? "Açık bir zarfta bekliyor" : x.cooldownUntil ? `Kopya, ${left(new Date(x.cooldownUntil).getTime() - now)} sonra kullanılabilir` : `${left(new Date(x.expiresAt).getTime() - now)} sonra bayatlar`}
                    </div>
                  </div>
                  <span className="num shrink-0 text-sm">{formatMoney(x.value)}</span>
                </label>
              );
            })}
          </fieldset>

          {d.block ? (
            <p className="border-t border-line px-4 py-3 text-sm text-mute">{d.block}.</p>
          ) : dossier ? (
            <div className="space-y-3 border-t border-line px-4 py-3">
              <div className="flex flex-wrap gap-1 text-sm" role="radiogroup" aria-label="Talep">
                {(
                  [
                    ["cash", "Para"],
                    ["shares", "Hisse devri"],
                    ["tender", "İhaleden çekilme"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    disabled={(k === "shares" && d.maxShares < 1) || (k === "tender" && d.tenders.length === 0)}
                    className={`rounded border px-3 py-1.5 disabled:opacity-40 ${kind === k ? "border-amber bg-amber/10 text-white" : "border-line text-mute hover:text-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {kind === "cash" && (
                <div>
                  <label htmlFor="bm-amount" className="text-xs text-mute">
                    İstenen tutar (dosyanın değeri {formatMoney(fair)}, en fazla {formatMoney(cap)})
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <input id="bm-amount" inputMode="numeric" className="input num max-w-[180px]" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(fair)} />
                    {[1, 2, 3].map((k) => (
                      <button key={k} className="btn !py-1.5 text-xs" onClick={() => setAmount(String(fair * k))}>
                        ×{k}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {kind === "shares" && (
                <div>
                  <label htmlFor="bm-shares" className="text-xs text-mute">
                    Kurucu hissesi (en fazla {d.maxShares}, hisse başı ${d.sharePrice.toLocaleString("tr-TR")})
                  </label>
                  <input id="bm-shares" inputMode="numeric" className="input num mt-1 max-w-[180px]" value={shares} onChange={(e) => setShares(e.target.value.replace(/[^\d]/g, ""))} />
                </div>
              )}
              {kind === "tender" && (
                <div>
                  <label htmlFor="bm-tender" className="text-xs text-mute">
                    Rakibin girdiğini öğrendiğin ihale
                  </label>
                  <select id="bm-tender" className="input mt-1 max-w-xs" value={tender} onChange={(e) => setTender(e.target.value)}>
                    <option value="">Seç</option>
                    {d.tenders.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {kind === "cash" && d.tenders.length === 0 && (
                <p className="text-[11px] text-mute">İhaleden çekilme isteyebilmek için önce “İhale zarfını ele geçir” operasyonuyla rakibin hangi ihaleye girdiğini öğren.</p>
              )}

              <div>
                <label htmlFor="bm-note" className="text-xs text-mute">
                  Zarfa bir not (isteğe bağlı, imzasız gider)
                </label>
                <textarea id="bm-note" className="input mt-1 min-h-[56px] resize-y !py-2 text-sm" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bu dosya basına ulaşırsa yarın manşettesin." />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="num text-xs">
                  <span className="text-mute">Talep değeri </span>
                  <span className={worth > cap ? "text-loss" : "text-white"}>{formatMoney(worth)}</span>
                  <span className="text-mute">, yolda yakalanma </span>
                  <span className="text-loss">%{Math.round(chance * 100)}</span>
                  {d.serial && <span className="text-loss">. Bu şirkete yakın zamanda zarf gönderdin; şüphe çekiyorsun</span>}
                </div>
                <button className="btn btn-primary !py-1.5 text-sm" disabled={busy || !valid} onClick={send}>
                  Zarfı gönder
                </button>
              </div>
            </div>
          ) : (
            <p className="border-t border-line px-4 py-3 text-sm text-mute">Şu an kullanılabilir bir dosyan yok.</p>
          )}
        </>
      )}
    </section>
  );
}
