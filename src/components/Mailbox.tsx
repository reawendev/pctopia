"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyMark } from "./Portrait";
import type { LogoSpec } from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import { apiFetch } from "@/lib/supabase/client";
import { ago } from "@/lib/time";

export type OfferChoice = { id: string; label: string; cost: number; minutes: number; p: number; win: number; lose: number; decline: boolean };
export type Offer = {
  id: string;
  template: string;
  sender: string;
  subject: string;
  body: string;
  status: "open" | "active" | "done" | "expired" | "declined";
  choices: OfferChoice[];
  chosen: { id: string; label: string } | null;
  resolvesAt: string | null;
  resultText: string | null;
  resultAmount: number | null;
  expiresAt: string;
  createdAt: string;
  read: boolean;
  crisis: boolean;
};
type Party = { id: string; name: string; founderName: string; logo: LogoSpec | null; logoUrl: string | null };
export type Message = { id: string; from: Party; to: Party; subject: string; body: string; createdAt: string; read: boolean };
export type InboxData = {
  ready: boolean;
  changed: boolean;
  offers: Offer[];
  inbox: Message[];
  sent: Message[];
  unread: { offers: number; messages: number };
};

type Item = { kind: "offer"; at: number; offer: Offer } | { kind: "message"; at: number; msg: Message };
type Folder = "gelen" | "giden";
type Sel = { kind: "offer" | "message" | "sent"; id: string } | { kind: "compose"; to?: string; subject?: string } | null;

function duration(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `${m} dk`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

function signed(n: number) {
  if (n > 0) return `+${formatMoney(n)}`;
  if (n < 0) return `−${formatMoney(-n)}`;
  return formatMoney(0);
}

function offerStatus(o: Offer, now: number): { text: string; tone: "wait" | "run" | "gain" | "loss" | "mute" } {
  switch (o.status) {
    case "open":
      return { text: `Yanıt bekliyor, ${duration(new Date(o.expiresAt).getTime() - now)} kaldı`, tone: "wait" };
    case "active":
      return { text: `Sürüyor, sonuç ${duration(new Date(o.resolvesAt!).getTime() - now)} sonra`, tone: "run" };
    case "done":
    case "expired": {
      const a = o.resultAmount ?? 0;
      if (o.status === "expired" && a === 0) return { text: "Süresi doldu", tone: "mute" };
      return { text: a === 0 ? "Sonuçlandı" : signed(a), tone: a > 0 ? "gain" : a < 0 ? "loss" : "mute" };
    }
    case "declined":
      return { text: "Reddedildi", tone: "mute" };
  }
}

const TONE: Record<string, string> = { wait: "text-amber", run: "text-amber-soft", gain: "text-gain", loss: "text-loss", mute: "text-mute" };

export function Mailbox({
  data,
  cash,
  now,
  reload,
  onState,
  notify,
}: {
  data: InboxData | null;
  cash: number;
  now: number;
  reload: () => Promise<void>;
  onState: (s: any) => void;
  notify: (m: string) => void;
}) {
  const [folder, setFolder] = useState<Folder>("gelen");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(() => {
    if (!data) return [];
    const list: Item[] = [
      ...data.offers.map((o) => ({ kind: "offer" as const, at: new Date(o.createdAt).getTime(), offer: o })),
      ...data.inbox.map((m) => ({ kind: "message" as const, at: new Date(m.createdAt).getTime(), msg: m })),
    ];
    return list.sort((a, b) => b.at - a.at);
  }, [data]);

  // Dar ekranda seçim yapılınca okuma bölmesine kaydır
  useEffect(() => {
    if (sel && window.matchMedia("(max-width: 1023px)").matches) paneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);

  async function open(kind: "offer" | "message", id: string, read: boolean) {
    setSel({ kind, id });
    if (!read) {
      apiFetch("/api/inbox/read", { method: "POST", body: JSON.stringify({ kind, id }) })
        .then(() => reload())
        .catch(() => {});
    }
  }

  async function respond(o: Offer, c: OfferChoice) {
    setBusy(true);
    try {
      const r = await apiFetch("/api/offers/respond", { method: "POST", body: JSON.stringify({ offerId: o.id, choiceId: c.id }) });
      onState(r);
      const res = r.offer as Offer;
      if (res.status === "done") notify(`${res.resultText ?? "Sonuçlandı"} ${res.resultAmount ? signed(res.resultAmount) : ""}`.trim());
      else if (res.status === "active") notify(`${c.label}: sonuç ${c.minutes} dakika içinde gelecek.`);
      else if (res.status === "declined") notify("Teklif reddedildi.");
      await reload();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="card p-5 text-sm text-mute">Posta kutusu açılıyor…</div>;
  if (!data.ready) {
    return (
      <div className="card p-5 text-sm text-mute">
        Posta ve teklifler için veritabanında <code className="text-white">004_teklifler_posta.sql</code> göçünün çalıştırılması gerekiyor.
      </div>
    );
  }

  const selectedOffer = sel?.kind === "offer" ? data.offers.find((o) => o.id === sel.id) : undefined;
  const selectedMsg = sel?.kind === "message" ? data.inbox.find((m) => m.id === sel.id) : sel?.kind === "sent" ? data.sent.find((m) => m.id === sel.id) : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* Liste */}
      <section className="card self-start">
        <div className="flex items-center gap-1 border-b border-line px-3 py-2">
          {(["gelen", "giden"] as Folder[]).map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              aria-pressed={folder === f}
              className={`rounded px-3 py-1.5 text-sm ${folder === f ? "bg-raised text-white" : "text-mute hover:text-white"}`}
            >
              {f === "gelen" ? "Gelen kutusu" : "Gönderilenler"}
            </button>
          ))}
          <button className="btn btn-primary ml-auto !px-3 !py-1.5" onClick={() => setSel({ kind: "compose" })}>
            Yeni posta
          </button>
        </div>

        {folder === "gelen" ? (
          items.length === 0 ? (
            <p className="px-5 py-6 text-sm text-mute">Kutun boş. İlk teklif birkaç dakika içinde masana düşer.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it) => {
                const active = sel && "id" in sel && sel.id === (it.kind === "offer" ? it.offer.id : it.msg.id);
                if (it.kind === "offer") {
                  const o = it.offer;
                  const st = offerStatus(o, now);
                  return (
                    <li key={o.id}>
                      <button onClick={() => open("offer", o.id, o.read)} className={`flex w-full gap-3 px-4 py-3 text-left ${active ? "bg-amber/[0.07]" : "hover:bg-raised"}`}>
                        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${o.read ? "bg-transparent" : o.crisis ? "bg-loss" : "bg-amber"}`} aria-label={o.read ? undefined : "okunmadı"} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm ${o.read ? "text-mute" : "font-medium text-white"}`}>{o.sender}</span>
                            <span className="shrink-0 text-xs text-mute">{ago(now - it.at)}</span>
                          </div>
                          <div className={`truncate ${o.read ? "text-white/80" : "font-medium"}`}>{o.subject}</div>
                          <div className={`num mt-0.5 text-xs ${TONE[st.tone]}`}>{st.text}</div>
                        </div>
                      </button>
                    </li>
                  );
                }
                const m = it.msg;
                return (
                  <li key={m.id}>
                    <button onClick={() => open("message", m.id, m.read)} className={`flex w-full gap-3 px-4 py-3 text-left ${active ? "bg-amber/[0.07]" : "hover:bg-raised"}`}>
                      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${m.read ? "bg-transparent" : "bg-gain"}`} aria-label={m.read ? undefined : "okunmadı"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${m.read ? "text-mute" : "font-medium text-white"}`}>
                            {m.from.founderName ? `${m.from.founderName}, ${m.from.name}` : m.from.name}
                          </span>
                          <span className="shrink-0 text-xs text-mute">{ago(now - it.at)}</span>
                        </div>
                        <div className={`truncate ${m.read ? "text-white/80" : "font-medium"}`}>{m.subject}</div>
                        <div className="mt-0.5 truncate text-xs text-mute">{m.body}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : data.sent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-mute">Henüz kimseye posta göndermedin.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.sent.map((m) => (
              <li key={m.id}>
                <button onClick={() => setSel({ kind: "sent", id: m.id })} className={`w-full px-4 py-3 text-left ${sel && "id" in sel && sel.id === m.id ? "bg-amber/[0.07]" : "hover:bg-raised"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-mute">Kime: {m.to.name}</span>
                    <span className="shrink-0 text-xs text-mute">{ago(now - new Date(m.createdAt).getTime())}</span>
                  </div>
                  <div className="truncate">{m.subject}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Okuma bölmesi */}
      <div ref={paneRef} className="scroll-mt-20 lg:sticky lg:top-28 lg:self-start">
        {sel?.kind === "compose" ? (
          <Compose
            initialTo={sel.to}
            initialSubject={sel.subject}
            onSent={async (to) => {
              notify(`Posta ${to} şirketine gönderildi.`);
              setFolder("giden");
              setSel(null);
              await reload();
            }}
            onCancel={() => setSel(null)}
            notify={notify}
          />
        ) : selectedOffer ? (
          <OfferPane o={selectedOffer} now={now} cash={cash} busy={busy} onChoose={(c) => respond(selectedOffer, c)} />
        ) : selectedMsg ? (
          <article className="card p-5">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              {(sel?.kind === "sent" ? selectedMsg.to.logo : selectedMsg.from.logo) && (
                <CompanyMark
                  spec={(sel?.kind === "sent" ? selectedMsg.to.logo : selectedMsg.from.logo)!}
                  url={sel?.kind === "sent" ? selectedMsg.to.logoUrl : selectedMsg.from.logoUrl}
                  size={36}
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm text-mute">
                  {sel?.kind === "sent" ? `Kime: ${selectedMsg.to.name}` : `${selectedMsg.from.founderName}, ${selectedMsg.from.name}`}
                </div>
                <h2 className="heading text-xl">{selectedMsg.subject}</h2>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">{selectedMsg.body}</p>
            <div className="mt-5 flex items-center justify-between text-sm text-mute">
              <span>{new Date(selectedMsg.createdAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</span>
              {sel?.kind === "message" && (
                <button
                  className="btn"
                  onClick={() =>
                    setSel({ kind: "compose", to: selectedMsg.from.id, subject: selectedMsg.subject.startsWith("Ynt: ") ? selectedMsg.subject : `Ynt: ${selectedMsg.subject}` })
                  }
                >
                  Yanıtla
                </button>
              )}
            </div>
          </article>
        ) : (
          <div className="card hidden p-8 text-center text-sm text-mute lg:block">Okumak için soldan bir posta seç.</div>
        )}
      </div>
    </div>
  );
}

function OfferPane({ o, now, cash, busy, onChoose }: { o: Offer; now: number; cash: number; busy: boolean; onChoose: (c: OfferChoice) => void }) {
  const st = offerStatus(o, now);
  return (
    <article className={`card p-5 ${o.crisis && o.status === "open" ? "border-loss/50" : ""}`}>
      <div className="border-b border-line pb-4">
        <div className="text-sm text-mute">{o.sender}</div>
        <h2 className="heading mt-0.5 text-xl">{o.subject}</h2>
        <div className={`num mt-1 text-sm ${TONE[st.tone]}`}>{st.text}</div>
      </div>
      <p className="mt-4 leading-relaxed">{o.body}</p>

      {o.status === "open" ? (
        <ul className="mt-5 space-y-3">
          {o.choices.map((c) =>
            c.decline ? (
              <li key={c.id}>
                <button className="text-sm text-mute underline-offset-4 hover:text-white hover:underline" disabled={busy} onClick={() => onChoose(c)}>
                  {c.label}
                </button>
              </li>
            ) : (
              <li key={c.id} className="rounded border border-line bg-ink/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{c.label}</div>
                    <dl className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                      <div>
                        <dt className="inline">Süre </dt>
                        <dd className="inline text-white">{c.minutes === 0 ? "anında" : `${c.minutes} dk`}</dd>
                      </div>
                      <div>
                        <dt className="inline">Başarı şansı </dt>
                        <dd className="inline text-white">%{Math.round(c.p * 100)}</dd>
                      </div>
                      {c.cost > 0 && (
                        <div>
                          <dt className="inline">Ön ödeme </dt>
                          <dd className="inline text-white">{formatMoney(c.cost)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline">{c.p >= 1 ? "Sonuç " : "Başarırsa "}</dt>
                        <dd className={`inline ${c.win - c.cost >= 0 ? "text-gain" : "text-loss"}`}>{signed(c.win - c.cost)}</dd>
                      </div>
                      {c.p < 1 && (
                        <div>
                          <dt className="inline">Olmazsa </dt>
                          <dd className={`inline ${c.lose - c.cost >= 0 ? "text-mute" : "text-loss"}`}>{signed(c.lose - c.cost)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <button className="btn btn-primary shrink-0" disabled={busy || cash < c.cost} onClick={() => onChoose(c)}>
                    {cash < c.cost ? "Nakit yetmiyor" : "Bunu seç"}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      ) : (
        <div className="mt-5 rounded border border-line bg-ink/60 p-4 text-sm">
          {o.chosen && <div className="text-mute">Kararın: {o.chosen.label}</div>}
          {o.status === "active" ? (
            <p className="mt-1">İş sürüyor. Sonuç {duration(new Date(o.resolvesAt!).getTime() - now)} içinde bu postaya ve şirket günlüğüne düşecek.</p>
          ) : (
            <p className="mt-1">
              {o.resultText}
              {o.resultAmount ? <span className={`num ml-2 ${o.resultAmount > 0 ? "text-gain" : "text-loss"}`}>{signed(o.resultAmount)}</span> : null}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Compose({
  initialTo,
  initialSubject,
  onSent,
  onCancel,
  notify,
}: {
  initialTo?: string;
  initialSubject?: string;
  onSent: (toName: string) => Promise<void>;
  onCancel: () => void;
  notify: (m: string) => void;
}) {
  const [dir, setDir] = useState<Party[] | null>(null);
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ companies: Party[] }>("/api/directory")
      .then((d) => setDir(d.companies))
      .catch((e) => notify(e.message));
  }, [notify]);

  useEffect(() => {
    setTo(initialTo ?? "");
    setSubject(initialSubject ?? "");
  }, [initialTo, initialSubject]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiFetch<{ to: string }>("/api/mail", { method: "POST", body: JSON.stringify({ toCompanyId: to, subject, body }) });
      setBody("");
      await onSent(r.to);
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="card space-y-4 p-5">
      <h2 className="heading text-xl">Yeni posta</h2>
      <div>
        <label className="label" htmlFor="to">Kime</label>
        <select id="to" className="input" value={to} onChange={(e) => setTo(e.target.value)} required>
          <option value="">{dir === null ? "Şirketler yükleniyor…" : dir.length === 0 ? "Henüz başka şirket yok" : "Şirket seç"}</option>
          {(dir ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.founderName})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="subj">Konu</label>
        <input id="subj" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required placeholder="Örn. Ortaklık görüşmesi" />
      </div>
      <div>
        <label className="label" htmlFor="body">Mesaj</label>
        <textarea id="body" className="input min-h-[160px] resize-y leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
        <div className="num mt-1 text-right text-xs text-mute">{body.length} / 2000</div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <button type="button" className="text-sm text-mute hover:text-white" onClick={onCancel}>
          Vazgeç
        </button>
        <button className="btn btn-primary" disabled={busy || !to}>
          {busy ? "Gönderiliyor…" : "Gönder"}
        </button>
      </div>
    </form>
  );
}
