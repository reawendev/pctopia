// Dünya olayları: herkesi aynı anda etkileyen ortak gündem.
// Hangi olayın ne zaman çıkacağı sunucuda gizli tohumla belirlenir (src/lib/server/events.ts).

import type { Slot } from "./workshop";

export const EVENT_SLOT_MS = 8 * 3_600_000; // her olay 8 saat sürer

export type SegmentId = "ofis" | "oyun" | "ust" | "is";

export type EventEffects = {
  demand?: Partial<Record<SegmentId | "all", number>>; // segment talep çarpanı
  parts?: Partial<Record<Slot, number>>; // parça maliyeti ve piyasa değeri çarpanı
  offerReward?: number; // teklif ödülü çarpanı
  crisisWeight?: number; // kriz tekliflerinin çıkma ağırlığı çarpanı
};

export type WorldEvent = { id: string; title: string; text: string; weight: number; effects: EventEffects };

export const WORLD_EVENTS: WorldEvent[] = [
  { id: "calm", title: "Sakin piyasa", text: "Gündemde büyük bir gelişme yok. Piyasalar olağan seyrinde.", weight: 4, effects: {} },
  { id: "school", title: "Okullar açılıyor", text: "Veliler ve kurumlar ofis bilgisayarlarına akın etti.", weight: 2, effects: { demand: { ofis: 2 } } },
  { id: "game_launch", title: "Yılın oyunu çıktı", text: "Beklenen oyun nihayet raflarda; oyuncu bilgisayarlarına talep patladı.", weight: 2, effects: { demand: { oyun: 1.8, ust: 1.6 } } },
  { id: "ai_boom", title: "Yapay zekâ çılgınlığı", text: "Şirketler yapay zekâ projeleri için güçlü iş istasyonu arıyor. Ekran kartları kapışılıyor.", weight: 2, effects: { demand: { is: 2.2, ust: 1.3 }, parts: { gpu: 1.25 } } },
  { id: "chip_crisis", title: "Çip krizi", text: "Asya'daki fabrikalarda üretim durdu. İşlemci ve ekran kartı fiyatları tavan yaptı.", weight: 2, effects: { parts: { gpu: 1.4, cpu: 1.2 }, demand: { all: 0.85 } } },
  { id: "ram_glut", title: "Bellek bolluğu", text: "Üreticiler stok eritmek için bellek ve SSD fiyatlarını düşürdü.", weight: 2, effects: { parts: { ram: 0.7, ssd: 0.8 } } },
  { id: "public_spending", title: "Kamu harcamaları arttı", text: "Yeni bütçeyle kurumlar dijital dönüşüm ihalelerini hızlandırdı.", weight: 2, effects: { offerReward: 1.3 } },
  { id: "recession", title: "Durgunluk sinyalleri", text: "Tüketici güveni geriledi; harcamalar ertelendi.", weight: 1, effects: { demand: { all: 0.7 }, offerReward: 0.8 } },
  { id: "black_friday", title: "Efsane indirim haftası", text: "Alışveriş çılgınlığı başladı; her segmentte satışlar uçuşta.", weight: 1, effects: { demand: { all: 1.6 } } },
  { id: "cyber_wave", title: "Siber saldırı dalgası", text: "Fidye yazılımı çeteleri şirketleri hedef alıyor. Güvenlik ekipleri alarmda.", weight: 1, effects: { crisisWeight: 4 } },
];

export const EVENT_BY_ID: Record<string, WorldEvent> = Object.fromEntries(WORLD_EVENTS.map((e) => [e.id, e]));

export function demandMultiplier(e: EventEffects | undefined, seg: SegmentId): number {
  return (e?.demand?.all ?? 1) * (e?.demand?.[seg] ?? 1);
}

export function partMultipliers(e: EventEffects | undefined): Partial<Record<Slot, number>> {
  return e?.parts ?? {};
}

/** Olay etkilerini okunur cümlelere çevirir (arayüz için). */
export function describeEffects(e: EventEffects): string[] {
  const out: string[] = [];
  const SEG: Record<string, string> = { all: "tüm segmentlerde", ofis: "ofis PC'lerinde", oyun: "oyun PC'lerinde", ust: "üst segmentte", is: "iş istasyonlarında" };
  const PART: Record<string, string> = { cpu: "işlemci", gpu: "ekran kartı", ram: "bellek", ssd: "depolama" };
  const pct = (x: number) => `${x >= 1 ? "+" : "−"}%${Math.round(Math.abs(x - 1) * 100)}`;
  for (const [k, v] of Object.entries(e.demand ?? {})) out.push(`Talep ${SEG[k]} ${pct(v!)}`);
  for (const [k, v] of Object.entries(e.parts ?? {})) out.push(`${PART[k][0].toLocaleUpperCase("tr")}${PART[k].slice(1)} fiyatları ${pct(v!)}`);
  if (e.offerReward) out.push(`Teklif ödülleri ${pct(e.offerReward)}`);
  if (e.crisisWeight) out.push("Kriz teklifleri çok daha sık");
  return out;
}
