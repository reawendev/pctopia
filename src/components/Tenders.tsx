"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/game/economy";
import { bondFor, tenderScore } from "@/lib/game/tenders";
import { QUALITY_LABEL, SLOT_LABEL, SLOTS, type Parts } from "@/lib/game/workshop";
import { apiFetch } from "@/lib/supabase/client";
import { SkeletonCard } from "./Skeleton";

type Tender = {
  id: string;
  buyer: string;
  title: string;
  parts: Parts;
  qty: number;
  budget: number;
  opensAt: string;
  closesAt: string;
  open: boolean;
  bids: number;
  mine: { modelId: string; unitPrice: number; bond: number; status: string } | null;
  result: { winner: string; price: number; mine: boolean; rival: boolean } | null;
  eligible: { id: string; name: string; stock: number; score: number }[];
};
type Data = { ready: boolean; open: Tender[]; past: Tender[] };

function left(ms: number) {
  if (ms <= 0) return "kapanıyor";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

export function Tenders({ cash, reputation, now, onState, notify }: { cash: number; reputation: number; now: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setD(await apiFetch<Data>("/api/tenders")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
    const t = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [load, notify]);

  async function post(body: object) {
    setBusy(true);
    try {
      const r = await apiFetch<any>("/api/tenders", { method: "POST", body: JSON.stringify(body) });
      setD(r);
      if (r.state) onState({ ...r.state, journal: r.journal });
      if (r.message) notify(r.message);
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <SkeletonCard label="İhale bülteni yükleniyor…" />;
  if (!d.ready) return <div className="card p-4 text-sm text-mute">İhaleler için veritabanında <code className="text-white">009_ihale_arge.sql</code> çalıştırılmalı.</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        Kurumlar iki saatte bir alım ihalesine çıkar, teklifler dört saat açık kalır. Zarflar kapalı: kimin kaç verdiğini kimse görmez. En düşük teklif kazanır ama itibar da sayılır; itibarın {reputation} olduğu için $100'lık bir
        teklifin ${Math.round(tenderScore(100, reputation))} gibi değerlendirilir. Kazanırsan kapanışta depondan teslimat yapılır. Stoğun yetmezse teminatın yanar ve itibarın 6 düşer.
      </p>
      {d.open.length === 0 ? (
        <SkeletonCard label="Şu an açık ihale yok. Yenisi en geç iki saat içinde yayımlanır." />
      ) : (
        d.open.map((t) => <OpenTender key={t.id} t={t} cash={cash} reputation={reputation} now={now} busy={busy} post={post} />)
      )}

      {d.past.length > 0 && (
        <section className="card">
          <h3 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Sonuçlanan ihaleler</h3>
          <ul className="divide-y divide-line">
            {d.past.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate">
                    {t.buyer}, {t.qty} adet
                  </div>
                  <div className="text-xs text-mute">{t.title}</div>
                </div>
                <div className="text-right">
                  {t.result ? (
                    <>
                      <div className={t.result.mine ? "text-gain" : ""}>
                        {t.result.mine ? "Sen kazandın" : t.result.winner}
                        <span className="num ml-2 text-mute">birim {formatMoney(t.result.price)}</span>
                      </div>
                      {t.mine && !t.result.mine && (
                        <div className={`text-xs ${t.mine.status === "failed" ? "text-loss" : "text-mute"}`}>
                          {t.mine.status === "failed" ? `Teslim edemedin, ${formatMoney(t.mine.bond)} teminat yandı` : `Senin teklifin: ${formatMoney(t.mine.unitPrice)}, teminat iade edildi`}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-mute">Sonuçlandırılıyor…</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OpenTender({ t, cash, reputation, now, busy, post }: { t: Tender; cash: number; reputation: number; now: number; busy: boolean; post: (b: object) => Promise<boolean> }) {
  const [model, setModel] = useState(t.mine?.modelId ?? t.eligible[0]?.id ?? "");
  const [price, setPrice] = useState(String(t.mine?.unitPrice ?? Math.round(t.budget * 0.95)));
  const p = Math.round(Number(price));
  const valid = p >= 1 && p <= t.budget;
  const bond = valid ? bondFor(t.qty, p) : 0;
  const sel = t.eligible.find((m) => m.id === model);
  const extra = t.mine && valid ? bond - t.mine.bond : bond;
  const total = valid ? t.qty * p : 0;
  const closes = new Date(t.closesAt).getTime();
  const specText = useMemo(() => SLOTS.map((k) => `${SLOT_LABEL[k]}: ${QUALITY_LABEL[t.parts[k]].toLocaleLowerCase("tr")}`).join(", "), [t.parts]);

  return (
    <section className={`card ${t.mine ? "border-amber/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-mute">{t.buyer}</div>
          <h3 className="heading text-lg">{t.title}</h3>
          <p className="mt-0.5 text-sm text-white/85">
            {t.qty} adet bilgisayar. En az şu parçalar: {specText}.
          </p>
        </div>
        <dl className="num grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right text-sm">
          <dt className="text-xs text-mute">Tavan birim fiyat</dt>
          <dd>{formatMoney(t.budget)}</dd>
          <dt className="text-xs text-mute">Kapanış</dt>
          <dd className={closes - now < 30 * 60_000 ? "text-amber" : ""}>{left(closes - now)}</dd>
          <dt className="text-xs text-mute">Zarf sayısı</dt>
          <dd>{t.bids}</dd>
        </dl>
      </div>

      {t.eligible.length === 0 ? (
        <p className="px-4 py-3 text-sm text-mute">Şartnameyi karşılayan bir modelin yok. PC Atölyesi'nde bu parçalarla ya da daha iyileriyle bir model tasarla.</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            post({ action: "bid", tenderId: t.id, modelId: model, unitPrice: p });
          }}
        >
          <div className="min-w-[180px] flex-1">
            <label className="label" htmlFor={`m-${t.id}`}>Teslim edilecek model</label>
            <select id={`m-${t.id}`} className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {t.eligible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (depoda {m.stock})
                </option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="label" htmlFor={`p-${t.id}`}>Birim fiyat ($)</label>
            <input id={`p-${t.id}`} className="input num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <button className="btn btn-primary" disabled={busy || !valid || !sel || cash < extra}>
            {t.mine ? "Teklifi güncelle" : "Teklif ver"}
          </button>
          {t.mine && (
            <button type="button" className="btn" disabled={busy} onClick={() => post({ action: "withdraw", tenderId: t.id })}>
              Geri çek
            </button>
          )}
          <p className="w-full text-xs text-mute">
            {!valid
              ? `Birim fiyat en fazla ${formatMoney(t.budget)} olabilir.`
              : `Toplam ${formatMoney(total)}. Teminat ${formatMoney(bond)} (%5), kaybedersen iade edilir.`}
            {sel && sel.stock < t.qty && valid && <span className="text-amber"> Depoda {sel.stock} adet var; kapanışa kadar {t.qty} adede tamamlamalısın.</span>}
            {t.mine && <span className="text-white"> Verdiğin teklif: birim {formatMoney(t.mine.unitPrice)}.</span>}
          </p>
        </form>
      )}
    </section>
  );
}
