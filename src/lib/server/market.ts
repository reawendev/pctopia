// Piyasa fiyat modeli — YALNIZCA SUNUCU.
//
// Fiyatlar veritabanına yazılmaz; gizli bir tohumdan deterministik olarak hesaplanır.
// Böylece tüm oyuncular aynı fiyatı görür, cron gerekmez ve gelecekteki fiyatlar
// tohumu bilmeyen biri tarafından tahmin edilemez.
//
// Model (log fiyat):  log P(n) = μ(n) + x(n)
//   μ(n): taban fiyat + yavaş döngüler (birkaç gün / haftalık) + çok hafif uzun vadeli büyüme
//   x(n): ortalamaya dönen gürültü (Ornstein–Uhlenbeck) + ara sıra haber şokları
//
// x her BLOCK başında WARMUP tik geriden 0 ile başlatılır. θ·WARMUP ≈ 18 olduğundan
// başlangıç noktasının etkisi e^-18 mertebesindedir, yani hangi aralığı hesaplarsan hesapla
// aynı tik için aynı fiyatı alırsın.

import { STOCKS, STOCK_BY_ID, TICK_MS, TICKS_PER_DAY, type Risk } from "../game/market";

const SECRET = process.env.MARKET_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || "pctopia-dev-seed";

const THETA = 0.003;
const WARMUP = 6000;
const BLOCK = TICKS_PER_DAY;
const EPOCH_TICK = Math.floor(Date.UTC(2026, 9, 17) / TICK_MS); // oyunun açılışı
const DRIFT = 0.0000015; // tik başına ≈ yılda %17

const RISK_PARAMS: Record<Risk, { sigma: number; a1: number; a2: number; shockP: number; shockSize: number }> = {
  low: { sigma: 0.0018, a1: 0.06, a2: 0.02, shockP: 0.0008, shockSize: 0.04 },
  mid: { sigma: 0.003, a1: 0.1, a2: 0.03, shockP: 0.0012, shockSize: 0.06 },
  high: { sigma: 0.0048, a1: 0.15, a2: 0.05, shockP: 0.0016, shockSize: 0.09 },
};

// ---- deterministik rastgelelik ----

function mix(a: number): number {
  a |= 0;
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}

function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return mix(h);
}

/** (0,1) aralığında tekdüze sayı */
function rand(seed: number, n: number, k: number): number {
  return (mix(seed ^ mix((n + Math.imul(k, 0x9e3779b9)) | 0)) + 0.5) / 4294967296;
}

function gauss(seed: number, n: number): number {
  const u = rand(seed, n, 1);
  const v = rand(seed, n, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- hisse başına sabitler ----

type Model = {
  seed: number;
  logBase: number;
  p: (typeof RISK_PARAMS)[Risk];
  P1: number;
  P2: number;
  ph1: number;
  ph2: number;
  drift: number;
};

const models = new Map<string, Model>();

function model(id: string): Model {
  let m = models.get(id);
  if (m) return m;
  const s = STOCK_BY_ID[id];
  if (!s) throw new Error("Bilinmeyen hisse: " + id);
  const seed = strHash(SECRET + ":" + id);
  m = {
    seed,
    logBase: Math.log(s.basePrice),
    p: RISK_PARAMS[s.risk],
    P1: Math.floor(TICKS_PER_DAY * (7 + 14 * rand(seed, 0, 10))), // 7–21 gün
    P2: Math.floor(TICKS_PER_DAY * (2 + 3 * rand(seed, 0, 11))), // 2–5 gün
    ph1: 2 * Math.PI * rand(seed, 0, 12),
    ph2: 2 * Math.PI * rand(seed, 0, 13),
    drift: DRIFT * (0.5 + rand(seed, 0, 14)),
  };
  models.set(id, m);
  return m;
}

function mu(m: Model, n: number): number {
  return (
    m.logBase +
    m.p.a1 * Math.sin((2 * Math.PI * n) / m.P1 + m.ph1) +
    m.p.a2 * Math.sin((2 * Math.PI * n) / m.P2 + m.ph2) +
    m.drift * (n - EPOCH_TICK)
  );
}

export type Shock = { tick: number; dir: 1 | -1; size: number; pick: number };

/** [from, to] aralığındaki fiyatlar ve şoklar (her iki uç dahil). */
export function series(id: string, from: number, to: number): { prices: number[]; shocks: Shock[] } {
  const m = model(id);
  const start = Math.floor(from / BLOCK) * BLOCK - WARMUP;
  const prices: number[] = [];
  const shocks: Shock[] = [];
  let x = 0;
  for (let n = start; n <= to; n++) {
    x = x * (1 - THETA) + m.p.sigma * gauss(m.seed, n);
    if (rand(m.seed, n, 3) < m.p.shockP) {
      const dir: 1 | -1 = rand(m.seed, n, 4) < 0.5 ? -1 : 1;
      const size = m.p.shockSize * (0.5 + rand(m.seed, n, 5));
      x += dir * size;
      if (n >= from) shocks.push({ tick: n, dir, size, pick: rand(m.seed, n, 6) });
    }
    if (n >= from) prices.push(Math.max(0.5, Math.round(Math.exp(mu(m, n) + x) * 100) / 100));
  }
  return { prices, shocks };
}

export function currentTick(now = Date.now()): number {
  return Math.floor(now / TICK_MS);
}

export function priceAt(id: string, tick: number): number {
  return series(id, tick, tick).prices[0];
}

// ---- haber metinleri ----

const NEWS: Record<string, { up: string[]; down: string[] }> = {
  Otomotiv: {
    up: ["{n}, yeni elektrikli modeli için rekor ön sipariş aldı", "{n} Avrupa'ya ihracat anlaşması imzaladı", "{n} çeyrek bilançosunda beklentileri aştı"],
    down: ["{n} fren sistemi nedeniyle geri çağırma başlattı", "Çip tedariki sorunu {n} üretim hattını durdurdu", "{n} satışlarında sert düşüş açıkladı"],
  },
  "Savunma Sanayii": {
    up: ["{n} büyük bir hava savunma ihalesini kazandı", "{n} yeni ihracat lisansı aldı", "Savunma bütçesi artışı {n} hisselerini yükseltti"],
    down: ["{n} teslimat takviminde gecikme yaşandığını açıkladı", "{n} için kritik ihale iptal edildi", "{n} test atışında başarısızlık bildirdi"],
  },
  Denizcilik: {
    up: ["{n} 6 gemilik konteyner siparişi aldı", "Navlun fiyatlarındaki artış {n} hisselerine yaradı", "{n} yeni kuru havuz tesisini açtı"],
    down: ["{n} müşterisi büyük siparişi iptal etti", "Çelik fiyatlarındaki artış {n} marjlarını eritti", "{n} tersanesinde iş kazası üretimi durdurdu"],
  },
  Havacılık: {
    up: ["{n} İHA'sı ilk ihracat sözleşmesini imzaladı", "{n} bölgesel uçağı sertifika aldı", "{n} uzay ajansıyla ortaklık duyurdu"],
    down: ["{n} test uçuşunda prototip kaybetti", "{n} programında maliyet aşımı açıklandı", "{n} motor tedarikçisiyle anlaşmazlık yaşıyor"],
  },
  Enerji: {
    up: ["{n} yeni rüzgâr santrali için lisans aldı", "Elektrik fiyatlarındaki yükseliş {n} gelirlerini artırdı", "{n} uzun vadeli enerji satış anlaşması imzaladı"],
    down: ["{n} santralinde arıza nedeniyle üretim durdu", "Teşvik değişikliği {n} hisselerini baskıladı", "{n} borç yapılandırmasına gitti"],
  },
  "Yarı İletken": {
    up: ["{n} yapay zekâ çipi için dev sipariş aldı", "{n} yeni üretim teknolojisine geçti", "{n} küresel bir telefon üreticisiyle anlaştı"],
    down: ["{n} fabrikasında kontaminasyon üretimi durdurdu", "İhracat kısıtlamaları {n} gelirlerini tehdit ediyor", "{n} yeni çipinde tasarım hatası bulundu"],
  },
  Lojistik: {
    up: ["{n} e-ticaret devinin teslimat ihalesini kazandı", "{n} yeni aktarma merkezini devreye aldı", "Bayram sezonu {n} hacimlerini zirveye taşıdı"],
    down: ["Akaryakıt zammı {n} kârlılığını düşürdü", "{n} çalışanları greve gitti", "{n} büyük müşterisini rakibine kaptırdı"],
  },
  Telekom: {
    up: ["{n} yeni nesil şebeke ihalesini kazandı", "{n} fiber abone sayısında rekor kırdı", "{n} temettü artışı açıkladı"],
    down: ["{n} kesinti nedeniyle ceza aldı", "Rekabet kurulu {n} hakkında soruşturma açtı", "{n} abone kaybı yaşadığını açıkladı"],
  },
};

export type NewsItem = { tick: number; at: number; stockId: string; dir: 1 | -1; impact: number; text: string };

function headline(stockId: string, s: Shock): string {
  const stock = STOCK_BY_ID[stockId];
  const set = NEWS[stock.sector] ?? { up: ["{n} olumlu bir gelişme açıkladı"], down: ["{n} olumsuz bir gelişme açıkladı"] };
  const list = s.dir > 0 ? set.up : set.down;
  return list[Math.floor(s.pick * list.length)].replace("{n}", stock.name);
}

// ---- anlık görüntü (tik başına önbellekli) ----

export type StockQuote = { id: string; price: number; open24h: number; change24h: number; spark: number[] };
export type Snapshot = { tick: number; nextTickAt: number; quotes: StockQuote[]; prices: Record<string, number>; news: NewsItem[] };

let cached: Snapshot | null = null;

const SPARK_STEP = 3; // 24 saatte 96 nokta
const NEWS_DAYS = 3; // haber akışı son 3 günü gösterir

export function snapshot(now = Date.now()): Snapshot {
  const tick = currentTick(now);
  if (cached && cached.tick === tick) return cached;

  const from = tick - TICKS_PER_DAY;
  const newsFrom = tick - NEWS_DAYS * TICKS_PER_DAY;
  const quotes: StockQuote[] = [];
  const prices: Record<string, number> = {};
  const news: NewsItem[] = [];

  for (const s of STOCKS) {
    const { prices: all, shocks } = series(s.id, newsFrom, tick);
    const ps = all.slice(from - newsFrom);
    const price = ps[ps.length - 1];
    const open = ps[0];
    const spark: number[] = [];
    for (let i = 0; i < ps.length; i += SPARK_STEP) spark.push(ps[i]);
    if (spark[spark.length - 1] !== price) spark.push(price);
    quotes.push({ id: s.id, price, open24h: open, change24h: price / open - 1, spark });
    prices[s.id] = price;
    for (const sh of shocks) {
      news.push({ tick: sh.tick, at: sh.tick * TICK_MS, stockId: s.id, dir: sh.dir, impact: sh.dir * sh.size, text: headline(s.id, sh) });
    }
  }

  news.sort((a, b) => b.tick - a.tick);
  cached = { tick, nextTickAt: (tick + 1) * TICK_MS, quotes, prices, news: news.slice(0, 12) };
  return cached;
}

export type Range = "1g" | "1h" | "1a";

const RANGE: Record<Range, { ticks: number; step: number }> = {
  "1g": { ticks: TICKS_PER_DAY, step: 1 }, // 1 gün, 5 dk
  "1h": { ticks: TICKS_PER_DAY * 7, step: 12 }, // 1 hafta, saatlik
  "1a": { ticks: TICKS_PER_DAY * 30, step: 48 }, // 1 ay, 4 saatlik
};

export function history(id: string, range: Range, now = Date.now()): { t: number; p: number }[] {
  const tick = currentTick(now);
  const { ticks, step } = RANGE[range];
  const from = tick - ticks;
  const { prices } = series(id, from, tick);
  const out: { t: number; p: number }[] = [];
  for (let i = 0; i < prices.length; i += step) out.push({ t: (from + i) * TICK_MS, p: prices[i] });
  if (out[out.length - 1].t !== tick * TICK_MS) out.push({ t: tick * TICK_MS, p: prices[prices.length - 1] });
  return out;
}
