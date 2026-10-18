// Ar-Ge: şirketin atölyesini kalıcı olarak güçlendiren projeler.
// Saf fonksiyonlar; sunucu ve istemci aynı hesabı yapar.

export type TechEffect = { parts?: number; demand?: number; premium?: number };

export type Tech = {
  id: string;
  name: string;
  desc: string;
  cost: number;
  hours: number;
  effect: TechEffect;
  requires?: string;
  /** Patentli projeyi ilk bitiren, PATENT_HOURS boyunca tek başına kullanır. */
  patent?: boolean;
};

export const PATENT_HOURS = 24;

export const TECHS: Tech[] = [
  { id: "montaj", name: "Hızlı montaj hattı", desc: "Montajı bantta yap, işçilik ve fireyi azalt.", cost: 4_000, hours: 1, effect: { parts: 0.05 } },
  { id: "tedarik", name: "Tedarikçi anlaşmaları", desc: "Distribütörlerle yıllık alım sözleşmesi.", cost: 15_000, hours: 3, effect: { parts: 0.08 }, requires: "montaj" },
  { id: "sogutma", name: "Sessiz soğutma tasarımı", desc: "Kendi kasa ve fan tasarımın. Müşteri farkı hisseder.", cost: 40_000, hours: 5, effect: { premium: 0.06 } },
  { id: "tasarim", name: "Endüstriyel tasarım", desc: "Tanınır bir ürün dili ve özenli kutu açılışı.", cost: 100_000, hours: 8, effect: { demand: 0.12 }, requires: "sogutma" },
  { id: "yz", name: "Yapay zekâ hızlandırıcı", desc: "Kendi hızlandırıcı kartın. Patent ilk bitirene.", cost: 400_000, hours: 12, effect: { premium: 0.12 }, requires: "tasarim", patent: true },
  { id: "grafik", name: "Yeni nesil grafik mimarisi", desc: "Bir kuşak ileri ekran kartı. Patent ilk bitirene.", cost: 1_500_000, hours: 20, effect: { demand: 0.25 }, requires: "yz", patent: true },
];

export const TECH_BY_ID: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export type ResearchRow = { companyId: string; techId: string; startedMs: number; doneMs: number };

const HOUR = 3_600_000;

/**
 * Bir şirketin bir projeden yararlanmaya başladığı an (yoksa null).
 * Patentli projede: ilk bitiren patenti alır; patent süresi içinde bitirenler patent bitince yararlanır.
 */
export function activeFrom(rows: ResearchRow[], companyId: string, techId: string): number | null {
  const mine = rows.find((r) => r.companyId === companyId && r.techId === techId);
  if (!mine) return null;
  if (!TECH_BY_ID[techId]?.patent) return mine.doneMs;
  const holder = patentHolder(rows, techId);
  if (!holder || holder.companyId === companyId) return mine.doneMs;
  const until = holder.doneMs + PATENT_HOURS * HOUR;
  return mine.doneMs < until ? until : mine.doneMs;
}

/** Patenti alan: projeyi ilk bitiren (eşitlikte önce başlayan). */
export function patentHolder(rows: ResearchRow[], techId: string): ResearchRow | null {
  let best: ResearchRow | null = null;
  for (const r of rows) {
    if (r.techId !== techId) continue;
    if (!best || r.doneMs < best.doneMs || (r.doneMs === best.doneMs && r.startedMs < best.startedMs)) best = r;
  }
  return best;
}

/** Şu an etkin projelerin toplam etkisi (üst sınırlı). */
export function techEffects(rows: ResearchRow[], companyId: string, nowMs: number): Required<TechEffect> {
  const out = { parts: 0, demand: 0, premium: 0 };
  for (const t of TECHS) {
    const from = activeFrom(rows, companyId, t.id);
    if (from === null || from > nowMs) continue;
    out.parts += t.effect.parts ?? 0;
    out.demand += t.effect.demand ?? 0;
    out.premium += t.effect.premium ?? 0;
  }
  return out;
}

export function effectText(e: TechEffect): string {
  const p: string[] = [];
  if (e.parts) p.push(`parça ve montaj maliyeti −%${Math.round(e.parts * 100)}`);
  if (e.premium) p.push(`hak edilen fiyat +%${Math.round(e.premium * 100)}`);
  if (e.demand) p.push(`pazarda çekicilik +%${Math.round(e.demand * 100)}`);
  return p.join(", ");
}
