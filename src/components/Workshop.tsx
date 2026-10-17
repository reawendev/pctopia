"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/game/economy";
import type { Perk } from "@/lib/game/life";
import {
  fairValue, isBottlenecked, MAX_LIST_RATIO, MAX_MODELS, PARTS, performanceScore, QUALITIES, QUALITY_LABEL, salesRate, segment,
  SLOT_LABEL, SLOTS, unitCost, verdict, type Parts, type PriceVerdict,
} from "@/lib/game/workshop";
import { apiFetch } from "@/lib/supabase/client";

type ModelView = {
  id: string;
  name: string;
  parts: Parts;
  price: number;
  stock: number;
  soldTotal: number;
  listed: boolean;
  unitCost: number;
  score: number;
  segment: string;
  bottleneck: boolean;
  fair: number;
  verdict: PriceVerdict;
  ratePerHour: number;
};
type WorkshopData = { ready: boolean; reputation: number; perks: Record<Perk, number>; models: ModelView[]; message?: string; journal?: unknown; state?: unknown };

export const VERDICT_STYLE: Record<PriceVerdict, string> = {
  fahiş: "border-loss/50 bg-loss/10 text-loss",
  pahalı: "border-amber/50 bg-amber/10 text-amber",
  piyasa: "border-line bg-raised text-white",
  uygun: "border-gain/40 bg-gain/10 text-gain",
  kelepir: "border-gain/40 bg-gain/10 text-gain",
};

const VERDICT_HINT: Record<PriceVerdict, string> = {
  fahiş: "Bu fiyata satılmaz; sosyal medyada tepki çeker.",
  pahalı: "Yavaş satar, eleştiri alabilir.",
  piyasa: "Piyasa fiyatı.",
  uygun: "Hızlı satar, övgü alabilir.",
  kelepir: "Çok hızlı satar ama kâr payın düşer.",
};

const rateText = (r: number) => (r <= 0 ? "satış yok" : `~${r.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} adet/saat`);

export function Workshop({
  cash,
  stageLevel,
  onState,
  notify,
}: {
  cash: number;
  stageLevel: number;
  onState: (s: any) => void;
  notify: (m: string) => void;
}) {
  const [data, setData] = useState<WorkshopData | null>(null);
  const [designing, setDesigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await apiFetch<WorkshopData>("/api/workshop")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [load, notify]);

  async function act(body: object) {
    setBusy(true);
    try {
      const r = await apiFetch<WorkshopData>("/api/workshop", { method: "POST", body: JSON.stringify(body) });
      setData(r);
      if (r.state) onState({ ...(r.state as object), journal: r.journal });
      if (r.message) notify(r.message);
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="card p-4 text-sm text-mute">Atölye açılıyor…</div>;
  if (!data.ready) return <div className="card p-4 text-sm text-mute">PC Atölyesi için veritabanında <code className="text-white">005_atolye_sosyal_hayat.sql</code> çalıştırılmalı.</div>;

  const ctx = { reputation: data.reputation, stageLevel, demandBonus: data.perks.demand, discount: data.perks.parts };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-mute">
          Parçaları seç, üret, fiyatı sen belirle. Talep, fiyatının hak ettiği değere oranına ve itibarına bağlı.
        </p>
        <button className="btn btn-primary !py-2" disabled={data.models.length >= MAX_MODELS} onClick={() => setDesigning((v) => !v)}>
          {designing ? "Tasarımı kapat" : data.models.length >= MAX_MODELS ? `En fazla ${MAX_MODELS} model` : "Yeni model tasarla"}
        </button>
      </div>

      {designing && <Designer ctx={ctx} busy={busy} onCreate={async (b) => (await act({ action: "create", ...b })) && setDesigning(false)} />}

      {data.models.length === 0 && !designing ? (
        <div className="card p-4 text-sm text-mute">Henüz bir modelin yok. İlk toplama PC'ni tasarlayarak başla.</div>
      ) : (
        <ul className="space-y-3">
          {data.models.map((m) => (
            <ModelCard key={m.id} m={m} ctx={ctx} cash={cash} busy={busy} act={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

type Ctx = { reputation: number; stageLevel: number; demandBonus: number; discount: number };

function PartPicker({ parts, setParts }: { parts: Parts; setParts: (p: Parts) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SLOTS.map((slot) => (
        <fieldset key={slot}>
          <legend className="mb-1 text-xs text-mute">{SLOT_LABEL[slot]}</legend>
          <div className="grid grid-cols-3 gap-1">
            {QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={parts[slot] === q}
                title={PARTS[slot][q].name}
                onClick={() => setParts({ ...parts, [slot]: q })}
                className={`rounded border px-2 py-1.5 text-left text-xs leading-tight ${parts[slot] === q ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}
              >
                <span className="block font-medium">{QUALITY_LABEL[q]}</span>
                <span className="num">{formatMoney(PARTS[slot][q].cost)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function Designer({ ctx, busy, onCreate }: { ctx: Ctx; busy: boolean; onCreate: (b: { name: string; parts: Parts; price: number }) => void }) {
  const [name, setName] = useState("");
  const [parts, setParts] = useState<Parts>({ cpu: "mid", gpu: "mid", ram: "mid", ssd: "mid" });
  const fair = fairValue(parts, ctx.reputation);
  const [price, setPrice] = useState(String(fair));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setPrice(String(fair));
  }, [fair, touched]);
  const cost = unitCost(parts, ctx.discount);
  const p = Number(price) || 0;
  const v = verdict(p, fair);

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ name, parts, price: p });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <label className="label !mb-1" htmlFor="mname">Model adı</label>
          <input id="mname" className="input !py-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Örn. Nova Ofis 1" required />
        </div>
        <div>
          <label className="label !mb-1" htmlFor="mprice">Satış fiyatı</label>
          <input id="mprice" className="input num !py-2" inputMode="numeric" value={price} onChange={(e) => (setTouched(true), setPrice(e.target.value.replace(/\D/g, "")))} />
        </div>
      </div>
      <PartPicker parts={parts} setParts={setParts} />
      <dl className="num grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-line bg-ink/60 p-3 text-sm sm:grid-cols-4">
        <Fig label="Birim maliyet" value={formatMoney(cost)} />
        <Fig label="Hak ettiği fiyat" value={formatMoney(fair)} />
        <Fig label="Performans" value={`${performanceScore(parts)} puan, ${segment(parts)}`} />
        <Fig label="Bu fiyatla" value={rateText(salesRate({ parts, price: p, ...ctx }))} />
      </dl>
      {isBottlenecked(parts) && <p className="text-sm text-amber">İşlemci ile ekran kartı arasında iki kademe fark var. Bu darboğaz, hak ettiği fiyatı %12 düşürür.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs ${VERDICT_STYLE[v]}`}>
          {v}: {VERDICT_HINT[v]}
        </span>
        <button className="btn btn-primary !py-2" disabled={busy || p < 1 || p > fair * MAX_LIST_RATIO}>
          Modeli tasarla
        </button>
      </div>
    </form>
  );
}

function ModelCard({ m, ctx, cash, busy, act }: { m: ModelView; ctx: Ctx; cash: number; busy: boolean; act: (b: object) => Promise<boolean> }) {
  const [price, setPrice] = useState(String(m.price));
  const [qty, setQty] = useState("10");
  useEffect(() => setPrice(String(m.price)), [m.price]);
  const p = Number(price) || 0;
  const live = useMemo(() => ({ v: verdict(p, m.fair), rate: salesRate({ parts: m.parts, price: p, ...ctx }) }), [p, m.fair, m.parts, ctx]);
  const n = Math.max(0, Math.min(100, Math.trunc(Number(qty) || 0)));
  const produceCost = n * m.unitCost;
  const margin = m.price - m.unitCost;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="heading truncate text-lg">{m.name}</h3>
          <p className="text-xs text-mute">
            {SLOTS.map((s) => `${SLOT_LABEL[s]} ${QUALITY_LABEL[m.parts[s]].toLocaleLowerCase("tr")}`).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs ${VERDICT_STYLE[m.verdict]}`}>{m.verdict}</span>
          <span className={`rounded border px-2 py-0.5 text-xs ${m.listed ? "border-gain/40 text-gain" : "border-line text-mute"}`}>{m.listed ? "Satışta" : "Satışta değil"}</span>
        </div>
      </div>

      <dl className="num mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
        <Fig label="Maliyet" value={formatMoney(m.unitCost)} />
        <Fig label="Hak ettiği" value={formatMoney(m.fair)} />
        <Fig label="Etiket" value={formatMoney(m.price)} tone={margin < 0 ? "text-loss" : undefined} />
        <Fig label="Stok" value={`${m.stock} adet`} />
        <Fig label="Satış hızı" value={m.stock === 0 ? "stok bitti" : !m.listed ? "satışta değil" : rateText(m.ratePerHour)} />
        <Fig label="Toplam satış" value={`${m.soldTotal} adet`} />
      </dl>

      <div className="mt-3 grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-mute" htmlFor={`p-${m.id}`}>
            Fiyat: <span className={live.v === "fahiş" ? "text-loss" : live.v === "pahalı" ? "text-amber" : "text-white"}>{live.v}</span>, {rateText(live.rate)}
          </label>
          <div className="flex gap-2">
            <input id={`p-${m.id}`} className="input num !py-2" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
            <button className="btn shrink-0 !py-2" disabled={busy || p < 1 || (p === m.price && m.listed)} onClick={() => act({ action: "price", modelId: m.id, price: p, listed: true })}>
              {m.listed ? "Güncelle" : "Satışa çıkar"}
            </button>
            {m.listed && (
              <button className="btn shrink-0 !py-2" disabled={busy} onClick={() => act({ action: "price", modelId: m.id, price: m.price, listed: false })}>
                Çek
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-mute" htmlFor={`q-${m.id}`}>
            Üretim: {n} adet, {formatMoney(produceCost)}
          </label>
          <div className="flex gap-2">
            <input id={`q-${m.id}`} className="input num !py-2" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
            {[10, 50].map((x) => (
              <button key={x} type="button" className="btn shrink-0 !px-2.5 !py-2 text-xs" onClick={() => setQty(String(x))}>
                {x}
              </button>
            ))}
            <button className="btn btn-primary shrink-0 !py-2" disabled={busy || n < 1 || produceCost > cash} onClick={() => act({ action: "produce", modelId: m.id, qty: n })}>
              Üret
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 text-right">
        <button
          className="text-xs text-mute underline-offset-4 hover:text-loss hover:underline"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`“${m.name}” kaldırılsın mı? ${m.stock > 0 ? `Depodaki ${m.stock} adet de silinir.` : ""}`)) act({ action: "delete", modelId: m.id });
          }}
        >
          Modeli kaldır
        </button>
      </div>
    </li>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`truncate ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
