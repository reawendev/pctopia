"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CompanyMark } from "./Portrait";
import { demandMultiplier, type EventEffects, type SegmentId } from "@/lib/game/events";
import type { LogoSpec } from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import type { Perk } from "@/lib/game/life";
import {
  appeal, estimateRate, fairValue, isBottlenecked, MAX_LIST_RATIO, PARTS, performanceScore, QUALITIES, QUALITY_LABEL,
  SEGMENT_IDS, SEGMENTS, segmentId, SLOT_LABEL, SLOTS, unitCost, verdict, type Listing, type PartMult, type Parts, type PriceVerdict,
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
  seg: SegmentId;
  segment: string;
  bottleneck: boolean;
  fair: number;
  verdict: PriceVerdict;
  ratePerHour: number;
  share: number;
  rivals: number;
};
type BoardRow = Listing & { name: string; companyName: string; logo: LogoSpec | null; logoUrl: string | null; price: number; fair: number; rate: number };
type WorkshopData = {
  ready: boolean;
  companyId: string;
  reputation: number;
  perks: Record<Perk, number>;
  models: ModelView[];
  market: BoardRow[];
  mine: Listing[];
  event: { id: string; demand: EventEffects["demand"]; parts: PartMult };
  limits?: { maxModels: number; maxStock: number; batch: number; facility: string };
  halt?: { label: string; until: string } | null;
  effects?: { kind: string; value: number; label: string; expiresAt: string }[];
  message?: string;
  journal?: unknown;
  state?: unknown;
};

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
const pct = (x: number) => `%${Math.round(x * 100)}`;

type Ctx = {
  companyId: string;
  reputation: number;
  demandBonus: number;
  discount: number;
  premium: number;
  mult: PartMult;
  listings: Listing[]; // pazardaki tüm ilanlar (benimkiler dahil)
  eventDemand: EventEffects["demand"];
};

function estimate(ctx: Ctx, parts: Parts, price: number, replaceId?: string) {
  const fair = fairValue(parts, ctx.reputation, ctx.mult, ctx.premium);
  const seg = segmentId(parts);
  const a = appeal(price, fair, ctx.reputation, ctx.demandBonus);
  return {
    fair,
    seg,
    v: verdict(price, fair),
    rate: estimateRate(ctx.listings, { companyId: ctx.companyId, seg, appeal: a, replaceId }, demandMultiplier({ demand: ctx.eventDemand }, seg)),
  };
}

export function Workshop({ cash, onState, notify }: { cash: number; stageLevel?: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<WorkshopData | null>(null);
  const [designing, setDesigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await apiFetch<WorkshopData>("/api/workshop")), []);
  useEffect(() => {
    load().catch((e) => notify(e.message));
    const t = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(t);
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

  const ctx: Ctx = {
    companyId: data.companyId,
    reputation: data.reputation,
    demandBonus: data.perks.demand,
    discount: data.perks.parts,
    premium: data.perks.premium ?? 0,
    mult: data.event.parts ?? {},
    listings: [...data.market, ...data.mine],
    eventDemand: data.event.demand,
  };

  const limits = data.limits ?? { maxModels: 5, maxStock: 500, batch: 100, facility: "Garaj atölyesi" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-mute">
          Tüm oyuncular aynı müşterileri paylaşır. Payın; fiyatının hak ettiği değere oranına, itibarına ve rakiplere bağlı.
        </p>
        <button className="btn btn-primary !py-2" disabled={data.models.length >= limits.maxModels} onClick={() => setDesigning((v) => !v)}>
          {designing ? "Tasarımı kapat" : data.models.length >= limits.maxModels ? `En fazla ${limits.maxModels} model` : "Yeni model tasarla"}
        </button>
      </div>
      <p className="text-xs text-mute">
        {limits.facility}: en fazla {limits.maxModels} model, model başına {limits.maxStock.toLocaleString("tr-TR")} adet depo, tek seferde {limits.batch.toLocaleString("tr-TR")} adet üretim. Daha büyüğü için Ofis sekmesinden tesisini büyüt.
      </p>
      {(data.effects ?? []).map((e, i) => (
        <div key={i} className="card border-loss/50 px-4 py-2.5 text-sm text-loss">
          {e.label}
        </div>
      ))}

      {designing && <Designer ctx={ctx} busy={busy} onCreate={async (b) => (await act({ action: "create", ...b })) && setDesigning(false)} />}

      {data.models.length === 0 && !designing ? (
        <div className="card p-4 text-sm text-mute">Henüz bir modelin yok. İlk toplama PC'ni tasarlayarak başla.</div>
      ) : (
        <ul className="space-y-3">
          {data.models.map((m) => (
            <ModelCard key={m.id} m={m} ctx={ctx} cash={cash} busy={busy} act={act} batch={limits.batch} halted={!!data.halt} />
          ))}
        </ul>
      )}

      <MarketBoard data={data} />
    </div>
  );
}

function PartPicker({ parts, setParts, mult }: { parts: Parts; setParts: (p: Parts) => void; mult: PartMult }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SLOTS.map((slot) => (
        <fieldset key={slot}>
          <legend className="mb-1 text-xs text-mute">
            {SLOT_LABEL[slot]}
            {mult[slot] && mult[slot] !== 1 && <span className={mult[slot]! > 1 ? "text-loss" : "text-gain"}> (gündem: {mult[slot]! > 1 ? "+" : "−"}%{Math.round(Math.abs(mult[slot]! - 1) * 100)})</span>}
          </legend>
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
                <span className="num">{formatMoney(Math.round(PARTS[slot][q].cost * (mult[slot] ?? 1)))}</span>
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
  const fair = fairValue(parts, ctx.reputation, ctx.mult, ctx.premium);
  const [price, setPrice] = useState(String(fair));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setPrice(String(fair));
  }, [fair, touched]);
  const cost = unitCost(parts, ctx.discount, ctx.mult);
  const p = Number(price) || 0;
  const est = estimate(ctx, parts, p);
  const rivals = new Set(ctx.listings.filter((l) => l.seg === est.seg && l.companyId !== ctx.companyId && l.appeal > 0).map((l) => l.companyId)).size;

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
      <PartPicker parts={parts} setParts={setParts} mult={ctx.mult} />
      <dl className="num grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-line bg-ink/60 p-3 text-sm sm:grid-cols-4">
        <Fig label="Birim maliyet" value={formatMoney(cost)} />
        <Fig label="Hak ettiği fiyat" value={formatMoney(fair)} />
        <Fig label="Segment" value={`${SEGMENTS[est.seg].label}, ${rivals ? `${rivals} rakip` : "rakip yok"}`} />
        <Fig label="Bu fiyatla" value={rateText(est.rate)} />
      </dl>
      {isBottlenecked(parts) && <p className="text-sm text-amber">İşlemci ile ekran kartı arasında iki kademe fark var. Bu darboğaz, hak ettiği fiyatı %12 düşürür.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs ${VERDICT_STYLE[est.v]}`}>
          {est.v}: {VERDICT_HINT[est.v]}
        </span>
        <button className="btn btn-primary !py-2" disabled={busy || p < 1 || p > fair * MAX_LIST_RATIO}>
          Modeli tasarla
        </button>
      </div>
      <p className="text-xs text-mute">Performans {performanceScore(parts)} puan.</p>
    </form>
  );
}

function ModelCard({ m, ctx, cash, busy, act, batch, halted }: { m: ModelView; ctx: Ctx; cash: number; busy: boolean; act: (b: object) => Promise<boolean>; batch: number; halted: boolean }) {
  const [price, setPrice] = useState(String(m.price));
  const [qty, setQty] = useState("10");
  useEffect(() => setPrice(String(m.price)), [m.price]);
  const p = Number(price) || 0;
  const live = useMemo(() => estimate(ctx, m.parts, p, m.id), [ctx, m.parts, p, m.id]);
  const n = Math.max(0, Math.min(batch, Math.trunc(Number(qty) || 0)));
  const produceCost = n * m.unitCost;
  const margin = m.price - m.unitCost;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="heading truncate text-lg">{m.name}</h3>
          <p className="text-xs text-mute">
            {SEGMENTS[m.seg].label} segmenti. {SLOTS.map((s) => `${SLOT_LABEL[s]} ${QUALITY_LABEL[m.parts[s]].toLocaleLowerCase("tr")}`).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs ${VERDICT_STYLE[m.verdict]}`}>{m.verdict}</span>
          <span className={`rounded border px-2 py-0.5 text-xs ${m.listed ? "border-gain/40 text-gain" : "border-line text-mute"}`}>{m.listed ? "Satışta" : "Satışta değil"}</span>
        </div>
      </div>

      <dl className="num mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-7">
        <Fig label="Maliyet" value={formatMoney(m.unitCost)} />
        <Fig label="Hak ettiği" value={formatMoney(m.fair)} />
        <Fig label="Etiket" value={formatMoney(m.price)} tone={margin < 0 ? "text-loss" : undefined} />
        <Fig label="Stok" value={`${m.stock} adet`} />
        <Fig label="Satış hızı" value={m.stock === 0 ? "stok bitti" : !m.listed ? "satışta değil" : rateText(m.ratePerHour)} />
        <Fig label="Pazar payı" value={m.listed && m.stock > 0 ? `${pct(m.share)}, ${m.rivals ? `${m.rivals} rakip` : "rakipsiz"}` : "—"} />
        <Fig label="Toplam satış" value={`${m.soldTotal} adet`} />
      </dl>

      <div className="mt-3 grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-mute" htmlFor={`p-${m.id}`}>
            Fiyat: <span className={live.v === "fahiş" ? "text-loss" : live.v === "pahalı" ? "text-amber" : "text-white"}>{live.v}</span>, bu fiyatla {rateText(live.rate)}
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
            {[10, 50, ...(batch >= 400 ? [Math.round(batch / 2)] : [])].map((x) => (
              <button key={x} type="button" className="btn shrink-0 !px-2.5 !py-2 text-xs" onClick={() => setQty(String(x))}>
                {x}
              </button>
            ))}
            <button className="btn btn-primary shrink-0 !py-2" disabled={busy || halted || n < 1 || produceCost > cash} onClick={() => act({ action: "produce", modelId: m.id, qty: n })}>
              {halted ? "Üretim durdu" : "Üret"}
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

/** Segment segment pazardaki ilanlar: kim, hangi fiyata, ne kadar satıyor. */
function MarketBoard({ data }: { data: WorkshopData }) {
  const [seg, setSeg] = useState<SegmentId>(data.models[0]?.seg ?? "ofis");
  const mine = data.models
    .filter((m) => m.listed && m.stock > 0)
    .map((m) => ({ id: m.id, name: m.name, companyName: "Sen", logo: null as LogoSpec | null, logoUrl: null, price: m.price, fair: m.fair, rate: m.ratePerHour, seg: m.seg, me: true }));
  const rows = [...data.market.map((r) => ({ ...r, me: false })), ...mine].filter((r) => r.seg === seg).sort((a, b) => b.rate - a.rate);
  const counts = Object.fromEntries(SEGMENT_IDS.map((s) => [s, [...data.market, ...mine].filter((r) => r.seg === s).length]));

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
        <h3 className="mr-2 font-serif font-semibold">Pazar</h3>
        {SEGMENT_IDS.map((s) => (
          <button key={s} onClick={() => setSeg(s)} aria-pressed={seg === s} className={`rounded px-2.5 py-1 text-xs ${seg === s ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
            {SEGMENTS[s].label} <span className="num text-mute">{counts[s]}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-mute">Bu segmentte satışta model yok. Talebin tamamı kurgusal rakiplere gidiyor; ilk sen gir.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => {
            const v = verdict(r.price, r.fair);
            return (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-2 ${r.me ? "bg-amber/[0.05]" : ""}`}>
                {r.logo ? <CompanyMark spec={r.logo} url={r.logoUrl} size={20} /> : <span className="h-5 w-5" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {r.name} <span className="text-xs text-mute">{r.me ? "senin" : r.companyName}</span>
                  </div>
                </div>
                <span className={`hidden rounded border px-1.5 text-[11px] sm:inline ${VERDICT_STYLE[v]}`}>{v}</span>
                <span className="num w-20 text-right">{formatMoney(r.price)}</span>
                <span className="num w-28 text-right text-xs text-mute">{rateText(r.rate)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`leading-tight ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
