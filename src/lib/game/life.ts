// Hayat: kurgusal karakterlerle arkadaşlık, flört, nişan ve evlilik.
// Tüm karakterler kurgusal yetişkinlerdir. Saf fonksiyonlar; sunucu ve istemci ortak kullanır.

import type { CharacterSpec } from "./config";

export type Interest = "sanat" | "spor" | "teknoloji" | "doğa" | "gece hayatı" | "gastronomi" | "kitap" | "seyahat";
export type Perk = "offer" | "shield" | "press" | "parts" | "demand";

export const PERK_TEXT: Record<Perk, (x: number) => string> = {
  offer: (x) => `Teklif başarı şansı +%${Math.round(x * 100)}`,
  shield: (x) => `Kriz ve teklif zararları −%${Math.round(x * 100)}`,
  press: (x) => `Olumlu haberlerin itibar etkisi +${Math.round(x)}`,
  parts: (x) => `PC parça maliyeti −%${Math.round(x * 100)}`,
  demand: (x) => `PC talebi +%${Math.round(x * 100)}`,
};

/** Arkadaşken verdiği yarar (sevgili/nişanlı/eşken iki katı). */
export const PERK_BASE: Record<Perk, number> = { offer: 0.03, shield: 0.15, press: 1, parts: 0.04, demand: 0.06 };

export type Npc = {
  id: string;
  name: string;
  age: number;
  job: string;
  perk: Perk;
  likes: Interest[];
  dislikes: Interest;
  bio: string;
  look: CharacterSpec;
};

const L = (gender: "man" | "woman", skin: string, hair: CharacterSpec["hair"], hairColor: string, suit: string, accessory: CharacterSpec["accessory"] = "none", age: CharacterSpec["age"] = "young"): CharacterSpec => ({
  gender,
  skin,
  hair,
  hairColor,
  suit,
  accessory,
  age,
});

export const NPCS: Npc[] = [
  { id: "selin", name: "Selin Aydın", age: 29, job: "Yatırım bankacısı", perk: "offer", likes: ["gastronomi", "seyahat"], dislikes: "doğa", bio: "Hafta içi borsa ekranları, hafta sonu yeni restoranlar.", look: L("woman", "#e0b48c", "long", "#4a2f1b", "#0f2a43") },
  { id: "emre", name: "Emre Yalçın", age: 32, job: "Avukat", perk: "shield", likes: ["kitap", "spor"], dislikes: "gece hayatı", bio: "Sözleşmelerin ince yazılarını okumaktan keyif alır.", look: L("man", "#c68b5f", "side", "#1a1411", "#1f2937", "glasses", "middle") },
  { id: "defne", name: "Defne Kurt", age: 27, job: "Teknoloji gazetecisi", perk: "press", likes: ["teknoloji", "gece hayatı"], dislikes: "spor", bio: "Her lansmanda ön sıradadır, her sızıntıyı ilk o duyar.", look: L("woman", "#f1d3b8", "short", "#7c2d12", "#3b1d2a") },
  { id: "kerem", name: "Kerem Şahin", age: 34, job: "Donanım mühendisi", perk: "parts", likes: ["teknoloji", "doğa"], dislikes: "gastronomi", bio: "Lehim kokusunu kahve kokusuna tercih eder.", look: L("man", "#e0b48c", "short", "#4a2f1b", "#14352a", "beard", "middle") },
  { id: "ece", name: "Ece Demir", age: 30, job: "Pazarlama direktörü", perk: "demand", likes: ["sanat", "seyahat"], dislikes: "kitap", bio: "Bir ürünü üç kelimeyle satmanın yolunu bulur.", look: L("woman", "#8d5a3b", "long", "#1a1411", "#44403c") },
  { id: "mert", name: "Mert Arslan", age: 28, job: "Girişim sermayedarı", perk: "offer", likes: ["spor", "gece hayatı"], dislikes: "sanat", bio: "Sabah koşusu, öğlen yatırım komitesi, akşam networking.", look: L("man", "#f1d3b8", "side", "#c9a15a", "#0f2a43") },
  { id: "zeynep", name: "Zeynep Ateş", age: 31, job: "Kriz iletişimi danışmanı", perk: "shield", likes: ["kitap", "sanat"], dislikes: "gece hayatı", bio: "Kötü haberleri sakin bir sesle anlatmakta ustadır.", look: L("woman", "#c68b5f", "short", "#1a1411", "#1f2937", "glasses", "middle") },
  { id: "can", name: "Can Öztürk", age: 26, job: "Teknoloji YouTuber'ı", perk: "press", likes: ["teknoloji", "gastronomi"], dislikes: "kitap", bio: "Yüz bin abonesine her kutu açılışını canlı yayınlar.", look: L("man", "#5b3a29", "short", "#1a1411", "#3b1d2a") },
  { id: "asli", name: "Aslı Polat", age: 33, job: "Tedarik zinciri müdürü", perk: "parts", likes: ["doğa", "seyahat"], dislikes: "teknoloji", bio: "Bir konteynerin limanda nerede beklediğini her zaman bilir.", look: L("woman", "#e0b48c", "side", "#8a5a2b", "#14352a", "none", "middle") },
  { id: "baran", name: "Baran Koç", age: 35, job: "Perakende zinciri sahibi", perk: "demand", likes: ["gastronomi", "spor"], dislikes: "sanat", bio: "Yirmi mağazasının raflarına ne gireceğine o karar verir.", look: L("man", "#8d5a3b", "bald", "#1a1411", "#44403c", "beard", "middle") },
  { id: "melis", name: "Melis Erdem", age: 28, job: "Ressam", perk: "press", likes: ["sanat", "doğa"], dislikes: "teknoloji", bio: "Galeri açılışları onun ikinci evidir.", look: L("woman", "#f1d3b8", "long", "#c9a15a", "#3b1d2a") },
  { id: "tolga", name: "Tolga Aksoy", age: 40, job: "Holding CFO'su", perk: "offer", likes: ["kitap", "seyahat"], dislikes: "spor", bio: "Rakamların arkasındaki hikâyeyi okumayı sever.", look: L("man", "#e0b48c", "side", "#9ca3af", "#1f2937", "glasses", "senior") },
];

export const NPC_BY_ID: Record<string, Npc> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export type Activity = {
  id: string;
  name: string;
  cost: number; // taban maliyet (kariyer basamağıyla ölçeklenir)
  gain: number;
  tag: Interest | null;
  minStage: StageId; // bu etkinlik için gereken en az yakınlık
};

export const ACTIVITIES: Activity[] = [
  { id: "kahve", name: "Kahve içmek", cost: 40, gain: 4, tag: null, minStage: "tanisik" },
  { id: "yuruyus", name: "Doğa yürüyüşü", cost: 60, gain: 5, tag: "doğa", minStage: "tanisik" },
  { id: "sergi", name: "Sergi gezmek", cost: 100, gain: 6, tag: "sanat", minStage: "tanisik" },
  { id: "kitapci", name: "Sahaf turu", cost: 80, gain: 5, tag: "kitap", minStage: "tanisik" },
  { id: "mac", name: "Maça gitmek", cost: 200, gain: 7, tag: "spor", minStage: "arkadas" },
  { id: "fuar", name: "Teknoloji fuarı", cost: 150, gain: 6, tag: "teknoloji", minStage: "arkadas" },
  { id: "yemek", name: "Akşam yemeği", cost: 250, gain: 8, tag: "gastronomi", minStage: "arkadas" },
  { id: "konser", name: "Konser", cost: 300, gain: 8, tag: "gece hayatı", minStage: "arkadas" },
  { id: "hediye", name: "Hediye almak", cost: 500, gain: 9, tag: null, minStage: "flort" },
  { id: "kacamak", name: "Hafta sonu kaçamağı", cost: 1500, gain: 15, tag: "seyahat", minStage: "flort" },
];

export const ACTIVITY_BY_ID: Record<string, Activity> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

export type StageId = "tanisik" | "arkadas" | "flort" | "sevgili" | "nisanli" | "evli";
export const STAGE_LABEL: Record<StageId, string> = {
  tanisik: "Tanışık",
  arkadas: "Arkadaş",
  flort: "Flört",
  sevgili: "Sevgili",
  nisanli: "Nişanlı",
  evli: "Evli",
};
const ORDER: StageId[] = ["tanisik", "arkadas", "flort", "sevgili", "nisanli", "evli"];
export const stageRank = (s: StageId) => ORDER.indexOf(s);

export const ROMANCE_FROM = 40; // flört eşiği
export const DECAY_HOURS = 8; // her 8 saatte 1 puan azalır
export const ACTIVITY_COOLDOWN_MIN = 20;
export const MEET_COOLDOWN_MIN = 60;
export const PROPOSE_MIN = 80;

/** Hayat masrafları kariyerle büyür: garajda kahve ucuz, holdingde pahalı. */
export function lifestyleMultiplier(stageLevel: number): number {
  return 1 + 0.6 * (stageLevel - 1);
}

export const RING_COST = 5_000;
export const WEDDING_COST = 20_000;
export const MEET_COST = 250;

/** Bakılmayan ilişkide yakınlık zamanla azalır; nişan/evlilikte 40'ın altına düşmez. */
export function effectiveAffection(stored: number, lastActivityMs: number, nowMs: number, committed: boolean): number {
  const decay = Math.floor(Math.max(0, nowMs - lastActivityMs) / (DECAY_HOURS * 3_600_000));
  const floor = committed ? ROMANCE_FROM : 0;
  return Math.max(floor, Math.min(100, stored - decay));
}

export function stageOf(affection: number, engaged: boolean, married: boolean): StageId {
  if (married) return "evli";
  if (engaged) return "nisanli";
  if (affection >= 60) return "sevgili";
  if (affection >= ROMANCE_FROM) return "flort";
  if (affection >= 20) return "arkadas";
  return "tanisik";
}

/** Etkinliğin yakınlığa etkisi: ilgi alanı +4, sevmediği şey −6, küçük bir şans payı. */
export function activityGain(npc: Npc, act: Activity, roll: number): number {
  let g = act.gain;
  if (act.tag && npc.likes.includes(act.tag)) g += 4;
  if (act.tag && npc.dislikes === act.tag) g -= 6;
  g += Math.round(roll * 5) - 2; // −2 … +3
  return g;
}

export function proposalChance(affection: number): number {
  return Math.max(0.1, Math.min(0.95, 0.4 + (affection - PROPOSE_MIN) * 0.03));
}

export type RelationState = { npcId: string; affection: number; engaged: boolean; married: boolean };

/** Arkadaş ve üstündeki kişilerin yararlarını toplar; partnerin yararı iki kat. */
export function perksFrom(rels: RelationState[]): Record<Perk, number> {
  const out: Record<Perk, number> = { offer: 0, shield: 0, press: 0, parts: 0, demand: 0 };
  for (const r of rels) {
    const npc = NPC_BY_ID[r.npcId];
    if (!npc) continue;
    const st = stageOf(r.affection, r.engaged, r.married);
    if (stageRank(st) < stageRank("arkadas")) continue;
    const mult = stageRank(st) >= stageRank("sevgili") ? 2 : 1;
    out[npc.perk] += PERK_BASE[npc.perk] * mult;
  }
  // Üst sınırlar: oyun dengesini bozmasın
  out.offer = Math.min(out.offer, 0.12);
  out.shield = Math.min(out.shield, 0.5);
  out.press = Math.min(out.press, 3);
  out.parts = Math.min(out.parts, 0.15);
  out.demand = Math.min(out.demand, 0.25);
  return out;
}
