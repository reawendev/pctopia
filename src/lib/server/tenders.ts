// İhaleler — YALNIZCA SUNUCU.
// Şartname ve kurgusal rakip teklifi gizli tohumdan deterministik üretilir, ilk ihtiyaçta veritabanına yazılır.
// Sonuçlandırma tembeldir: posta/şirket istekleri sırasında süresi dolanlar settle_tender ile kapatılır.

import { formatMoney } from "../game/economy";
import { bondFor, meetsSpec, TENDER_EPOCH, TENDER_OPEN_MS, TENDER_SLOT_MS, tenderScore } from "../game/tenders";
import { fairValue, performanceScore, type Parts } from "../game/workshop";
import type { SegmentId } from "../game/events";
import { isMissingTable, logEvent } from "./company";
import { postAbout } from "./social";
import { invalidateMarket, loadModels } from "./workshop";
import { db, HttpError } from "./supabase";

const SECRET = (process.env.MARKET_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || "pctopia-dev-seed") + ":ihale";

function mix(a: number): number {
  a |= 0;
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return mix(h);
}
const rnd = (seed: number, k: number) => (mix(seed ^ mix(Math.imul(k + 1, 0x9e3779b9))) + 0.5) / 4294967296;
const pick = <T,>(xs: T[], r: number) => xs[Math.floor(r * xs.length)];

type Kind = { seg: SegmentId; weight: number; qty: [number, number]; specs: Parts[]; buyers: [string, string][] };

const KINDS: Kind[] = [
  {
    seg: "ofis",
    weight: 0.4,
    qty: [100, 250],
    specs: [
      { cpu: "low", gpu: "low", ram: "mid", ssd: "low" },
      { cpu: "mid", gpu: "low", ram: "mid", ssd: "mid" },
    ],
    buyers: [
      ["Milli Eğitim Müdürlüğü", "Okul bilgisayar laboratuvarları"],
      ["Büyükşehir Belediyesi", "Hizmet binası ofis bilgisayarları"],
      ["Devlet Hastanesi", "Poliklinik kayıt bilgisayarları"],
      ["Kamu Bankası", "Şube yenileme projesi"],
    ],
  },
  {
    seg: "oyun",
    weight: 0.3,
    qty: [60, 150],
    specs: [
      { cpu: "mid", gpu: "mid", ram: "mid", ssd: "mid" },
      { cpu: "mid", gpu: "high", ram: "mid", ssd: "mid" },
    ],
    buyers: [
      ["Espor Kulübü", "Antrenman merkezi kurulumu"],
      ["İnternet Kafe Zinciri", "Salon yenileme"],
      ["Oyun Stüdyosu", "Test ekipmanı"],
    ],
  },
  {
    seg: "ust",
    weight: 0.18,
    qty: [30, 80],
    specs: [{ cpu: "high", gpu: "high", ram: "mid", ssd: "mid" }],
    buyers: [
      ["Yayın Ajansı", "Canlı yayın stüdyosu"],
      ["Görsel Efekt Stüdyosu", "Render istasyonları"],
    ],
  },
  {
    seg: "is",
    weight: 0.12,
    qty: [20, 60],
    specs: [
      { cpu: "high", gpu: "mid", ram: "high", ssd: "high" },
      { cpu: "high", gpu: "high", ram: "high", ssd: "high" },
    ],
    buyers: [
      ["Teknik Üniversite", "Mühendislik laboratuvarı"],
      ["Savunma Sanayii Ar-Ge Merkezi", "Simülasyon istasyonları"],
      ["Mimarlık Ofisi", "Tasarım istasyonları"],
    ],
  },
];
const RIVALS = ["Anadolu Sistem", "Boğaziçi Bilişim", "Ege Teknoloji", "Toros Bilgisayar"];

export type TenderSpec = {
  id: string;
  buyer: string;
  title: string;
  parts: Parts;
  qty: number;
  budget: number;
  rival_name: string;
  rival_price: number;
  opens_at: string;
  closes_at: string;
};

export function specForSlot(k: number): TenderSpec {
  const seed = seedOf(SECRET + ":" + k);
  let r = rnd(seed, 0);
  let kind = KINDS[KINDS.length - 1];
  for (const x of KINDS) {
    if (r < x.weight) {
      kind = x;
      break;
    }
    r -= x.weight;
  }
  const parts = pick(kind.specs, rnd(seed, 1));
  const [buyer, title] = pick(kind.buyers, rnd(seed, 2));
  const qty = Math.round((kind.qty[0] + (kind.qty[1] - kind.qty[0]) * rnd(seed, 3)) / 10) * 10;
  const budget = Math.round((fairValue(parts, 50) * (1.1 + 0.15 * rnd(seed, 4))) / 10) * 10;
  const rival = Math.round((budget * (0.86 + 0.12 * rnd(seed, 5))) / 5) * 5;
  const opens = TENDER_EPOCH + k * TENDER_SLOT_MS;
  return {
    id: String(k),
    buyer,
    title,
    parts,
    qty,
    budget,
    rival_name: pick(RIVALS, rnd(seed, 6)),
    rival_price: rival,
    opens_at: new Date(opens).toISOString(),
    closes_at: new Date(opens + TENDER_OPEN_MS).toISOString(),
  };
}

/** Şu an teklif alan ihale dilimleri. */
function openSlots(now: number): number[] {
  const last = Math.floor((now - TENDER_EPOCH) / TENDER_SLOT_MS);
  const first = Math.floor((now - TENDER_OPEN_MS - TENDER_EPOCH) / TENDER_SLOT_MS) + 1;
  const out: number[] = [];
  for (let k = Math.max(0, first); k <= last; k++) out.push(k);
  return out;
}

let ensured = -1;

/** Açık dilimlerin şartnamesini yazar (varsa dokunmaz). 009 yoksa false. */
async function ensureTenders(now: number): Promise<boolean> {
  const slots = openSlots(now);
  const need = slots.filter((k) => k > ensured);
  if (need.length === 0) return true;
  const { error } = await db().from("tenders").upsert(need.map(specForSlot), { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    if (isMissingTable(error)) return false;
    throw new HttpError(500, error.message);
  }
  ensured = Math.max(ensured, ...need);
  return true;
}

/** Süresi dolan ihaleleri kapatır, sonuçları günlüğe ve akışa yazar. Ucuzdur (tek sorgu); her istekte çağrılabilir. */
export async function syncTenders(): Promise<boolean> {
  const now = Date.now();
  if (!(await ensureTenders(now))) return false;
  let settled = false;
  const { data: due, error } = await db().from("tenders").select("id").eq("status", "open").lt("closes_at", new Date(now).toISOString());
  if (error) throw new HttpError(500, error.message);
  for (const t of due ?? []) {
    const { data: r, error: e } = await db().rpc("settle_tender", { p_tender: t.id });
    if (e) {
      console.error("settle_tender", e.message);
      continue;
    }
    if (!r) continue;
    settled = true;
    const total = r.qty * r.price;
    if (r.winner) {
      await logEvent(r.winner, "tender", `${r.buyer} ihalesi kazanıldı: ${r.qty} adet, birim ${formatMoney(r.price)}, toplam ${formatMoney(total)}. İtibar +3.`, total);
      await postAbout(r.winner, "bid_won", { company: r.name, buyer: r.buyer, qty: r.qty, price: formatMoney(r.price), total: formatMoney(total) });
      invalidateMarket();
    }
    for (const f of r.failed ?? []) {
      await logEvent(f.company, "tender", `${r.buyer} ihalesinde teslimat yapılamadı. ${formatMoney(f.bond)} teminat yandı, itibar −6.`, -f.bond);
      await postAbout(f.company, "bid_failed", { company: f.name, buyer: r.buyer });
    }
    for (const l of r.losers ?? []) {
      await logEvent(l.company, "tender", `${r.buyer} ihalesini ${r.name} aldı (birim ${formatMoney(r.price)}). ${formatMoney(l.bond)} teminat iade edildi.`, l.bond);
    }
  }
  return settled;
}

type Model = { id: string; name: string; parts: Parts; stock: number };

export async function tenderView(companyId: string) {
  await syncTenders();
  const { data: tenders, error } = await db().from("tenders").select("*").order("closes_at", { ascending: false }).limit(10);
  if (error) {
    if (isMissingTable(error)) return { ready: false as const };
    throw new HttpError(500, error.message);
  }
  const ids = (tenders ?? []).map((t) => t.id);
  const { data: bids } = ids.length ? await db().from("tender_bids").select("tender_id, company_id, model_id, unit_price, bond, status").in("tender_id", ids) : { data: [] as any[] };
  const models = ((await loadModels(companyId)) ?? []) as Model[];
  const now = Date.now();
  const view = (tenders ?? []).map((t) => {
    const all = (bids ?? []).filter((b) => b.tender_id === t.id);
    const mine = all.find((b) => b.company_id === companyId);
    const open = t.status === "open" && new Date(t.closes_at).getTime() > now;
    return {
      id: t.id,
      buyer: t.buyer,
      title: t.title,
      parts: t.parts as Parts,
      qty: t.qty,
      budget: Number(t.budget),
      opensAt: t.opens_at,
      closesAt: t.closes_at,
      open,
      bids: all.length, // kapalı zarf: yalnızca sayı
      mine: mine ? { modelId: mine.model_id, unitPrice: Number(mine.unit_price), bond: Number(mine.bond), status: mine.status } : null,
      result: t.status === "settled" ? { winner: t.winner_name, price: Number(t.winner_price), mine: t.winner_company === companyId, rival: !t.winner_company } : null,
      eligible: models
        .filter((m) => meetsSpec(m.parts, t.parts))
        .map((m) => ({ id: m.id, name: m.name, stock: m.stock, score: performanceScore(m.parts) })),
    };
  });
  return { ready: true as const, open: view.filter((t) => t.open), past: view.filter((t) => !t.open).slice(0, 6) };
}

export async function placeBid(companyId: string, reputation: number, tenderId: string, modelId: string, unitPrice: number) {
  const { data: t } = await db().from("tenders").select("*").eq("id", tenderId).maybeSingle();
  if (!t || t.status !== "open" || new Date(t.closes_at).getTime() <= Date.now()) throw new HttpError(409, "Bu ihale teklif almıyor");
  const price = Math.round(unitPrice);
  if (!(price >= 1)) throw new HttpError(400, "Birim fiyat geçersiz");
  if (price > Number(t.budget)) throw new HttpError(400, `Şartnamedeki en yüksek birim fiyat ${formatMoney(Number(t.budget))}`);
  const m = ((await loadModels(companyId)) ?? []).find((x) => x.id === modelId);
  if (!m) throw new HttpError(404, "Model bulunamadı");
  if (!meetsSpec(m.parts, t.parts)) throw new HttpError(400, "Bu model şartnamedeki parça kalitesini karşılamıyor");
  const bond = bondFor(t.qty, price);
  const { error } = await db().rpc("tender_bid", { p_tender: tenderId, p_company: companyId, p_model: modelId, p_price: price, p_bond: bond });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Teklif için ${formatMoney(bond)} teminat gerekiyor`);
    if (/kapandı/.test(error.message)) throw new HttpError(409, "Bu ihale teklif almıyor");
    throw new HttpError(500, error.message);
  }
  await logEvent(companyId, "tender", `${t.buyer} ihalesine birim ${formatMoney(price)} teklif verildi. Teminat ${formatMoney(bond)}.`, -bond);
  const score = tenderScore(price, reputation);
  return { message: `Teklif kapalı zarfla verildi. İtibarınla değerlendirme fiyatın ${formatMoney(Math.round(score))}.`, bond };
}

export async function withdrawBid(companyId: string, tenderId: string) {
  const { data, error } = await db().rpc("tender_withdraw", { p_tender: tenderId, p_company: companyId });
  if (error) {
    if (/kapandı/.test(error.message)) throw new HttpError(409, "İhale kapandı, teklif geri çekilemez");
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "Bekleyen teklifin yok");
  await logEvent(companyId, "tender", "İhale teklifi geri çekildi, teminat iade edildi.");
  return { message: "Teklif geri çekildi, teminat iade edildi." };
}
