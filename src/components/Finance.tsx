"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompanyMark } from "./Portrait";
import type { LogoSpec } from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import { DEAL_LABEL, LOAN_TERMS, loanAtMaturity, type DealKind, type Role } from "@/lib/game/finance";
import { apiFetch } from "@/lib/supabase/client";
import { ago } from "@/lib/time";

type Notify = (m: string) => void;
type OnState = (s: any) => void;
type Sub = "banka" | "calisanlar" | "anlasmalar";

function left(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d} gün ${h} sa` : h > 0 ? `${h} sa ${m % 60} dk` : `${m % 60} dk`;
}

/** Ortak POST yardımcısı: durum, günlük ve mesajı sayfaya iletir. */
function usePost<T>(url: string, setData: (d: T) => void, onState: OnState, notify: Notify) {
  const [busy, setBusy] = useState(false);
  const post = useCallback(
    async (body: object) => {
      setBusy(true);
      try {
        const r = await apiFetch<any>(url, { method: "POST", body: JSON.stringify(body) });
        setData(r);
        if (r.state) onState({ ...r.state, journal: r.journal });
        if (r.message) notify(r.message);
        return true;
      } catch (e: any) {
        notify(e.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [url, setData, onState, notify]
  );
  return { busy, post };
}

export function Finance({ cash, now, onState, notify, pendingDeals, initialTo }: { cash: number; now: number; onState: OnState; notify: Notify; pendingDeals: number; initialTo?: string | null }) {
  const [sub, setSub] = useState<Sub>(initialTo ? "anlasmalar" : "banka");
  useEffect(() => {
    if (initialTo) setSub("anlasmalar");
  }, [initialTo]);
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-line bg-panel p-0.5 text-sm" role="tablist">
        {(
          [
            ["banka", "Banka"],
            ["calisanlar", "Çalışanlar"],
            ["anlasmalar", "Anlaşmalar"],
          ] as [Sub, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`rounded px-3 py-1.5 ${sub === k ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
            {l}
            {k === "anlasmalar" && pendingDeals > 0 && <span className="num ml-1.5 rounded-full bg-amber px-1.5 text-[10px] font-semibold text-ink">{pendingDeals}</span>}
          </button>
        ))}
      </div>
      {sub === "banka" && <Bank cash={cash} now={now} onState={onState} notify={notify} />}
      {sub === "calisanlar" && <Staff cash={cash} onState={onState} notify={notify} />}
      {sub === "anlasmalar" && <Deals cash={cash} now={now} onState={onState} notify={notify} initialTo={initialTo} />}
    </div>
  );
}

// ---------------- Banka ----------------

type BankData = {
  ready: boolean;
  loanRate: number;
  depositRate: number;
  terms: number[];
  limit: number;
  loan: { principal: number; owed: number; dueAt: string; takenAt: string } | null;
  deposit: number;
  bannedUntil: string | null;
};

function Bank({ cash, now, onState, notify }: { cash: number; now: number; onState: OnState; notify: Notify }) {
  const [d, setD] = useState<BankData | null>(null);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState(1);
  const [dep, setDep] = useState("");
  useEffect(() => {
    apiFetch<BankData>("/api/bank").then(setD).catch((e) => notify(e.message));
  }, [notify]);
  const { busy, post } = usePost<BankData>("/api/bank", setD, onState, notify);
  if (!d) return <div className="card p-4 text-sm text-mute">Banka açılıyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Banka için veritabanında <code className="text-white">007_finans.sql</code> çalıştırılmalı.</div>;
  const a = Number(amount) || 0;
  const b = Number(dep) || 0;
  const banned = d.bannedUntil && new Date(d.bannedUntil).getTime() > now;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="heading text-lg">Kredi</h3>
        <p className="text-sm text-mute">
          Günlük %{(d.loanRate * 100).toLocaleString("tr-TR")} basit faiz. Vadede kasandan otomatik ödenir; yetmezse itibarın düşer ve banka bir gün kredi vermez.
        </p>
        {d.loan ? (
          <div className="mt-3 space-y-2">
            <dl className="num grid grid-cols-3 gap-2 text-sm">
              <Fig label="Çekilen" value={formatMoney(d.loan.principal)} />
              <Fig label="Şu anki borç" value={formatMoney(d.loan.owed)} tone="text-loss" />
              <Fig label="Vadeye" value={left(new Date(d.loan.dueAt).getTime() - now)} />
            </dl>
            <button className="btn btn-primary !py-2" disabled={busy || cash < d.loan.owed} onClick={() => post({ action: "repay" })}>
              {cash < d.loan.owed ? "Kapatmak için nakit yetmiyor" : `Krediyi kapat, ${formatMoney(d.loan.owed)}`}
            </button>
          </div>
        ) : banned ? (
          <p className="mt-3 text-sm text-loss">Temerrüt nedeniyle banka {left(new Date(d.bannedUntil!).getTime() - now)} daha kredi vermeyecek.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-mute">Limitin: {formatMoney(d.limit)} (net değerinin yarısı)</div>
            <div className="flex flex-wrap gap-2">
              <input className="input num !w-40 !py-2" inputMode="numeric" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
              {d.terms.map((t) => (
                <button key={t} type="button" onClick={() => setDays(t)} aria-pressed={days === t} className={`rounded border px-3 py-2 text-sm ${days === t ? "border-amber text-amber-soft" : "border-line text-mute"}`}>
                  {t} gün
                </button>
              ))}
            </div>
            <div className="text-xs text-mute">{a > 0 ? `Vadede ödenecek: ${formatMoney(loanAtMaturity(a, d.loanRate, days))}` : " "}</div>
            <button className="btn btn-primary !py-2" disabled={busy || a < 100 || a > d.limit} onClick={() => post({ action: "borrow", amount: a, days }).then((ok) => ok && setAmount(""))}>
              Kredi çek
            </button>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h3 className="heading text-lg">Mevduat</h3>
        <p className="text-sm text-mute">Günlük %{(d.depositRate * 100).toLocaleString("tr-TR")} faiz işler, istediğin zaman çekersin. Net değerine dahildir.</p>
        <div className="num mt-3 text-2xl font-semibold text-gain">{formatMoney(d.deposit)}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input num !w-40 !py-2" inputMode="numeric" placeholder="Tutar" value={dep} onChange={(e) => setDep(e.target.value.replace(/\D/g, ""))} />
          <button className="btn !py-2" disabled={busy || b < 1 || b > cash} onClick={() => post({ action: "deposit", amount: b }).then((ok) => ok && setDep(""))}>
            Yatır
          </button>
          <button className="btn !py-2" disabled={busy || b < 1 || b > d.deposit} onClick={() => post({ action: "withdraw", amount: b }).then((ok) => ok && setDep(""))}>
            Çek
          </button>
          {d.deposit > 0 && (
            <button className="text-xs text-mute underline-offset-4 hover:text-white hover:underline" onClick={() => setDep(String(d.deposit))}>
              tümü
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------- Çalışanlar ----------------

type StaffData = { ready: boolean; roles: { role: Role; name: string; desc: string; salary: number; hired: boolean; hiredAt: string | null }[] };

function Staff({ cash, onState, notify }: { cash: number; onState: OnState; notify: Notify }) {
  const [d, setD] = useState<StaffData | null>(null);
  useEffect(() => {
    apiFetch<StaffData>("/api/staff").then(setD).catch((e) => notify(e.message));
  }, [notify]);
  const { busy, post } = usePost<StaffData>("/api/staff", setD, onState, notify);
  if (!d) return <div className="card p-4 text-sm text-mute">Kadro yükleniyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Çalışanlar için veritabanında <code className="text-white">007_finans.sql</code> çalıştırılmalı.</div>;
  const total = d.roles.filter((r) => r.hired).reduce((s, r) => s + r.salary, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        Maaşlar saatlik işler ve kasadan otomatik ödenir; ödenemezse herkes istifa eder. Maaş, saatlik gelirin büyüdükçe artar.
        {total > 0 && <> Şu anki toplam: <span className="num text-white">{formatMoney(total)}/saat</span>.</>}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {d.roles.map((r) => (
          <li key={r.role} className={`card flex flex-col gap-2 p-4 ${r.hired ? "border-gain/40" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="heading text-lg">{r.name}</h3>
              <span className="num text-sm text-mute">{formatMoney(r.salary)}/saat</span>
            </div>
            <p className="flex-1 text-sm text-white/85">{r.desc}</p>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs ${r.hired ? "text-gain" : "text-mute"}`}>{r.hired ? `İşe alındı: ${ago(Date.now() - new Date(r.hiredAt!).getTime())}` : "Boş pozisyon"}</span>
              {r.hired ? (
                <button className="btn !py-1.5 text-xs" disabled={busy} onClick={() => post({ action: "fire", role: r.role })}>
                  İşten çıkar
                </button>
              ) : (
                <button className="btn btn-primary !py-1.5 text-xs" disabled={busy || cash < r.salary * 4} onClick={() => post({ action: "hire", role: r.role })}>
                  İşe al
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Anlaşmalar ----------------

type Party = { id: string; name: string; founderName: string; logo: LogoSpec | null; logoUrl: string | null };
type Deal = {
  id: string;
  kind: DealKind;
  kindLabel: string;
  summary: string;
  terms: any;
  note: string | null;
  status: string;
  from: Party;
  to: Party;
  createdAt: string;
  expiresAt: string;
  endsAt: string | null;
  result: string | null;
};
type DealsData = { ready: boolean; incoming: Deal[]; outgoing: Deal[]; myModels: { id: string; name: string; stock: number; price: number }[]; pending: number };

const STATUS: Record<string, [string, string]> = {
  pending: ["Yanıt bekliyor", "text-amber"],
  active: ["Sürüyor", "text-gain"],
  completed: ["Tamamlandı", "text-mute"],
  defaulted: ["Ödenmedi", "text-loss"],
  declined: ["Reddedildi", "text-mute"],
  cancelled: ["Geri çekildi", "text-mute"],
  expired: ["Süresi doldu", "text-mute"],
};

function Deals({ cash, now, onState, notify, initialTo }: { cash: number; now: number; onState: OnState; notify: Notify; initialTo?: string | null }) {
  const [d, setD] = useState<DealsData | null>(null);
  const [composing, setComposing] = useState(!!initialTo);
  const load = useCallback(() => apiFetch<DealsData>("/api/deals").then(setD).catch((e) => notify(e.message)), [notify]);
  useEffect(() => {
    load();
  }, [load]);
  const { busy, post } = usePost<DealsData>("/api/deals", setD, onState, notify);
  if (!d) return <div className="card p-4 text-sm text-mute">Anlaşmalar yükleniyor…</div>;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">Anlaşmalar için veritabanında <code className="text-white">007_finans.sql</code> çalıştırılmalı.</div>;

  const row = (x: Deal, mine: boolean) => {
    const other = mine ? x.to : x.from;
    const [label, tone] = STATUS[x.status] ?? [x.status, "text-mute"];
    const live = x.status === "pending" && new Date(x.expiresAt).getTime() > now;
    return (
      <li key={x.id} className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {other.logo && <CompanyMark spec={other.logo} url={other.logoUrl} size={20} />}
            <span className="truncate text-sm font-medium">
              {mine ? "Kime: " : ""}
              <Link href={`/sirket/${other.id}`} className="hover:text-amber">
                {other.name}
              </Link>
            </span>
            <span className="text-xs text-mute">{x.kindLabel}</span>
          </div>
          <span className={`text-xs ${tone}`}>
            {label}
            {x.status === "active" && x.endsAt ? `, ${left(new Date(x.endsAt).getTime() - now)} kaldı` : ""}
            {live ? `, ${left(new Date(x.expiresAt).getTime() - now)} geçerli` : ""}
          </span>
        </div>
        <p className="mt-1 text-sm">{x.summary}.</p>
        {x.note && <p className="mt-1 font-serif text-sm italic text-white/80">“{x.note}”</p>}
        {live && (
          <div className="mt-2 flex gap-2">
            {mine ? (
              <button className="btn !py-1.5 text-xs" disabled={busy} onClick={() => post({ action: "cancel", dealId: x.id })}>
                Geri çek
              </button>
            ) : (
              <>
                <button className="btn btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => post({ action: "accept", dealId: x.id })}>
                  Kabul et
                </button>
                <button className="btn !py-1.5 text-xs" disabled={busy} onClick={() => post({ action: "decline", dealId: x.id })}>
                  Reddet
                </button>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-mute">Arkadaşlarına toptan PC satabilir, borç verebilir ya da gelirlerinden pay satın alabilirsin. Para ve mal kabul anında el değiştirir.</p>
        <button className="btn btn-primary !py-2" onClick={() => setComposing((v) => !v)}>
          {composing ? "Kapat" : "Yeni teklif"}
        </button>
      </div>
      {composing && <Propose cash={cash} models={d.myModels} initialTo={initialTo} busy={busy} onSend={async (b) => (await post({ action: "propose", ...b })) && setComposing(false)} />}
      <section className="card">
        <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Sana gelen teklifler</h3>
        {d.incoming.length === 0 ? <p className="px-4 py-3 text-sm text-mute">Henüz kimse sana teklif yapmadı.</p> : <ul className="divide-y divide-line">{d.incoming.map((x) => row(x, false))}</ul>}
      </section>
      <section className="card">
        <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Senin tekliflerin</h3>
        {d.outgoing.length === 0 ? <p className="px-4 py-3 text-sm text-mute">Henüz teklif göndermedin.</p> : <ul className="divide-y divide-line">{d.outgoing.map((x) => row(x, true))}</ul>}
      </section>
    </div>
  );
}

function Propose({
  cash,
  models,
  initialTo,
  busy,
  onSend,
}: {
  cash: number;
  models: { id: string; name: string; stock: number; price: number }[];
  initialTo?: string | null;
  busy: boolean;
  onSend: (b: object) => void;
}) {
  const [dir, setDir] = useState<Party[] | null>(null);
  const [to, setTo] = useState(initialTo ?? "");
  const [kind, setKind] = useState<DealKind>("loan");
  const [f, setF] = useState<Record<string, string>>({ qty: "10", unitPrice: "", amount: "5000", interestPct: "10", days: "2", payment: "2000", sharePct: "10", modelId: "" });
  const [note, setNote] = useState("");
  useEffect(() => {
    apiFetch<{ companies: Party[] }>("/api/directory").then((r) => setDir(r.companies)).catch(() => setDir([]));
  }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value.replace(k === "modelId" ? /$^/ : /\D/g, "") });
  const n = (k: string) => Number(f[k]) || 0;
  const model = models.find((m) => m.id === f.modelId);
  const terms =
    kind === "wholesale" ? { modelId: f.modelId, qty: n("qty"), unitPrice: n("unitPrice") } : kind === "loan" ? { amount: n("amount"), interestPct: n("interestPct"), days: n("days") } : { payment: n("payment"), sharePct: n("sharePct"), days: n("days") };
  const preview =
    kind === "wholesale"
      ? model && n("qty") && n("unitPrice") ? `${n("qty")} adet “${model.name}”, toplam ${formatMoney(n("qty") * n("unitPrice"))}` : "Model, adet ve birim fiyat seç."
      : kind === "loan"
      ? `${formatMoney(n("amount"))} ver, ${n("days")} gün sonra ${formatMoney(Math.ceil(n("amount") * (1 + n("interestPct") / 100)))} geri al.`
      : `${formatMoney(n("payment"))} öde, ${n("days")} gün boyunca gelirinin %${n("sharePct")} payını al.`;
  const needCash = kind === "loan" ? n("amount") : kind === "revshare" ? n("payment") : 0;

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSend({ kind, toCompanyId: to, terms, note });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label !mb-1" htmlFor="dto">Kime</label>
          <select id="dto" className="input !py-2" value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="">{dir === null ? "Yükleniyor…" : dir.length === 0 ? "Henüz başka şirket yok" : "Şirket seç"}</option>
            {(dir ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.founderName})
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label !mb-1">Tür</span>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(DEAL_LABEL) as DealKind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded border px-2 py-2 text-xs ${kind === k ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute"}`}>
                {DEAL_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {kind === "wholesale" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label !mb-1" htmlFor="dm">Model</label>
            <select id="dm" className="input !py-2" value={f.modelId} onChange={set("modelId")} required>
              <option value="">{models.length ? "Seç" : "Önce atölyede model üret"}</option>
              {models.filter((m) => m.stock > 0).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.stock} adet)
                </option>
              ))}
            </select>
          </div>
          <Field id="dq" label="Adet" value={f.qty} onChange={set("qty")} />
          <Field id="du" label="Birim fiyat ($)" value={f.unitPrice} onChange={set("unitPrice")} placeholder={model ? String(Math.round(model.price * 0.8)) : ""} />
        </div>
      )}
      {kind === "loan" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="la" label="Tutar ($)" value={f.amount} onChange={set("amount")} />
          <Field id="li" label="Toplam faiz (%)" value={f.interestPct} onChange={set("interestPct")} />
          <Field id="ld" label="Vade (gün, 1-7)" value={f.days} onChange={set("days")} />
        </div>
      )}
      {kind === "revshare" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="rp" label="Ödeyeceğin ($)" value={f.payment} onChange={set("payment")} />
          <Field id="rs" label="Gelir payı (%, 1-25)" value={f.sharePct} onChange={set("sharePct")} />
          <Field id="rd" label="Süre (gün, 1-7)" value={f.days} onChange={set("days")} />
        </div>
      )}
      <div>
        <label className="label !mb-1" htmlFor="dn">Not (isteğe bağlı)</label>
        <input id="dn" className="input !py-2" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Bayram öncesi stok lazım olur diye düşündüm." />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-white/85">{preview}</p>
        <button className="btn btn-primary !py-2" disabled={busy || !to || needCash > cash}>
          {needCash > cash ? "Kasada nakit yetmiyor" : "Teklifi gönder"}
        </button>
      </div>
      <p className="text-xs text-mute">Karşı tarafa posta ile haber gider; 24 saat içinde yanıt vermezse teklif düşer.</p>
    </form>
  );
}

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label !mb-1" htmlFor={id}>{label}</label>
      <input id={id} className="input num !py-2" inputMode="numeric" value={value} onChange={onChange} placeholder={placeholder} required />
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}
