// Piyasa fiyat modeli — YALNIZCA SUNUCU.
//
// Fiyatlar veritabanına yazılmaz; gizli bir tohumdan deterministik olarak hesaplanır.
// Böylece tüm oyuncular aynı fiyatı görür, cron gerekmez ve gelecekteki fiyatlar
// tohumu bilmeyen biri tarafından tahmin edilemez.
//
// Model (log fiyat):  log P(n) = μ(n) + x(n)
//   μ(n): taban fiyat + yavaş döngüler (günler / haftalar) + çok hafif uzun vadeli büyüme
//   x(n): ortalamaya dönen gürültü (Ornstein–Uhlenbeck) + ara sıra haber şokları
//
// İki "motor" var:
//   ESKİ: 5 dakikalık tik (oyunun ilk sürümü). SWITCH anından önceki geçmiş bununla üretilir.
//   YENİ: 1 dakikalık tik. Parametreler, 5 dakikadaki oynaklık aynı kalacak şekilde ölçeklendi.
// Geçişte fiyat sıçramasın diye yeni motorun log fiyatına L·e^(−θ·t) düzeltmesi eklenir:
// SWITCH anında fiyat eski motorla birebir aynıdır, fark birkaç gün içinde söner.
//
// HAREKET katmanı (LIVE_MS'den itibaren): 20 saniyelik tiklerle dakikalık fiyatın üstüne eklenir.
//   y: hızlı, ortalamaya dönen gürültü (yarı ömür ≈ 1 saat) — fiyat her 20 saniyede kıpırdar
//   j: sıçrama ve çöküşler (%5–30), birkaç saatte kısmen geri döner (yarı ömür ≈ 10 saat)
// LIVE_MS anında katman sıfırdan başlar, böylece geçişte fiyat kopmaz.

import { STOCKS, STOCK_BY_ID, TICK_MS, TICKS_PER_DAY, type Risk } from "../game/market";

const MINUTE = 60_000;
const PER_MIN = MINUTE / TICK_MS; // dakikada 3 tik

const SECRET = process.env.MARKET_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || "pctopia-dev-seed";

const EPOCH_MS = Date.UTC(2026, 9, 17); // oyunun açılışı
export const SWITCH_MS = Date.UTC(2026, 9, 17, 21, 15, 0); // 5 dk → 1 dk geçişi (18 Ekim 00:15, İstanbul; yayından sonra)
const DRIFT_PER_5MIN = 0.0000015; // ≈ yılda %17

const RISK_PARAMS: Record<Risk, { sigma: number; a1: number; a2: number; shockP: number; shockSize: number }> = {
  // Değerler 5 dakikalık tik içindir; yeni motor bunları ölçekler.
  low: { sigma: 0.0018, a1: 0.06, a2: 0.02, shockP: 0.0008, shockSize: 0.04 },
  mid: { sigma: 0.003, a1: 0.1, a2: 0.03, shockP: 0.0012, shockSize: 0.06 },
  high: { sigma: 0.0048, a1: 0.15, a2: 0.05, shockP: 0.0016, shockSize: 0.09 },
};

type Engine = {
  tickMs: number;
  theta: number;
  warmup: number; // θ·warmup ≈ 15–18: başlangıç noktasının etkisi ihmal edilebilir
  block: number;
  sigmaScale: number;
  shockScale: number;
};

const OLD: Engine = { tickMs: 5 * 60_000, theta: 0.003, warmup: 6000, block: 288, sigmaScale: 1, shockScale: 1 };
const NEW: Engine = { tickMs: MINUTE, theta: 0.0006, warmup: 25_000, block: 1440, sigmaScale: 1 / Math.sqrt(5), shockScale: 1 / 5 };

const SWITCH_MIN = Math.floor(SWITCH_MS / MINUTE);
const SWITCH_OLD = Math.floor(SWITCH_MS / OLD.tickMs);

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

// ---- hisse başına sabitler (motor başına) ----

type Model = {
  seed: number;
  logBase: number;
  sigma: number;
  shockP: number;
  shockSize: number;
  a1: number;
  a2: number;
  P1: number;
  P2: number;
  ph1: number;
  ph2: number;
  drift: number;
  epochTick: number;
};

const models = new Map<string, Model>();

function model(e: Engine, id: string): Model {
  const key = e.tickMs + ":" + id;
  let m = models.get(key);
  if (m) return m;
  const s = STOCK_BY_ID[id];
  if (!s) throw new Error("Bilinmeyen hisse: " + id);
  const seed = strHash(SECRET + ":" + id);
  const p = RISK_PARAMS[s.risk];
  const perDay = 86_400_000 / e.tickMs;
  m = {
    seed,
    logBase: Math.log(s.basePrice),
    sigma: p.sigma * e.sigmaScale,
    shockP: p.shockP * e.shockScale,
    shockSize: p.shockSize,
    a1: p.a1,
    a2: p.a2,
    P1: Math.floor(perDay * (7 + 14 * rand(seed, 0, 10))), // 7–21 gün
    P2: Math.floor(perDay * (2 + 3 * rand(seed, 0, 11))), // 2–5 gün
    ph1: 2 * Math.PI * rand(seed, 0, 12),
    ph2: 2 * Math.PI * rand(seed, 0, 13),
    drift: DRIFT_PER_5MIN * (e.tickMs / OLD.tickMs) * (0.5 + rand(seed, 0, 14)),
    epochTick: Math.floor(EPOCH_MS / e.tickMs),
  };
  models.set(key, m);
  return m;
}

function mu(m: Model, n: number): number {
  return (
    m.logBase +
    m.a1 * Math.sin((2 * Math.PI * n) / m.P1 + m.ph1) +
    m.a2 * Math.sin((2 * Math.PI * n) / m.P2 + m.ph2) +
    m.drift * (n - m.epochTick)
  );
}

type RawShock = { n: number; dir: 1 | -1; size: number; pick: number };

/** Bir motorun [from, to] tikleri için ham log fiyatlar ve şoklar. */
function engineSeries(e: Engine, id: string, from: number, to: number): { logs: Float64Array; shocks: RawShock[] } {
  const m = model(e, id);
  const start = Math.floor(from / e.block) * e.block - e.warmup;
  const logs = new Float64Array(Math.max(0, to - from + 1));
  const shocks: RawShock[] = [];
  let x = 0;
  for (let n = start; n <= to; n++) {
    x = x * (1 - e.theta) + m.sigma * gauss(m.seed, n);
    if (rand(m.seed, n, 3) < m.shockP) {
      const dir: 1 | -1 = rand(m.seed, n, 4) < 0.5 ? -1 : 1;
      const size = m.shockSize * (0.5 + rand(m.seed, n, 5));
      x += dir * size;
      if (n >= from) shocks.push({ n, dir, size, pick: rand(m.seed, n, 6) });
    }
    if (n >= from) logs[n - from] = mu(m, n) + x;
  }
  return { logs, shocks };
}

// Geçiş düzeltmesi: L = log P_eski(SWITCH) − log P_yeni_ham(SWITCH)
const switchGap = new Map<string, number>();
function gap(id: string): number {
  let g = switchGap.get(id);
  if (g === undefined) {
    const oldLog = engineSeries(OLD, id, SWITCH_OLD, SWITCH_OLD).logs[0];
    const newLog = engineSeries(NEW, id, SWITCH_MIN, SWITCH_MIN).logs[0];
    g = oldLog - newLog;
    switchGap.set(id, g);
  }
  return g;
}

const toPrice = (log: number) => Math.max(0.5, Math.round(Math.exp(log) * 100) / 100);

export type Shock = { tick: number; at: number; dir: 1 | -1; size: number; pick: number; jump?: boolean };

/** Dakikalık [from, to] aralığındaki log fiyatlar ve şoklar (her iki uç dahil). */
function minuteLogs(id: string, from: number, to: number): { logs: Float64Array; shocks: Shock[] } {
  const out = new Float64Array(Math.max(0, to - from + 1));
  const shocks: Shock[] = [];

  // Geçişten önceki kısım: eski 5 dakikalık motor, her dakikaya o 5 dakikanın fiyatı
  if (from < SWITCH_MIN) {
    const endMin = Math.min(to, SWITCH_MIN - 1);
    const oFrom = Math.floor((from * MINUTE) / OLD.tickMs);
    const oTo = Math.floor((endMin * MINUTE) / OLD.tickMs);
    const { logs, shocks: os } = engineSeries(OLD, id, oFrom, oTo);
    for (let mnt = from; mnt <= endMin; mnt++) out[mnt - from] = logs[Math.floor((mnt * MINUTE) / OLD.tickMs) - oFrom];
    for (const s of os) {
      const at = s.n * OLD.tickMs;
      if (at >= from * MINUTE) shocks.push({ tick: Math.floor(at / TICK_MS), at, dir: s.dir, size: s.size, pick: s.pick });
    }
  }

  // Geçişten sonrası: yeni dakikalık motor + sönen düzeltme
  if (to >= SWITCH_MIN) {
    const nFrom = Math.max(from, SWITCH_MIN);
    const { logs, shocks: ns } = engineSeries(NEW, id, nFrom, to);
    const L = gap(id);
    for (let mnt = nFrom; mnt <= to; mnt++) out[mnt - from] = logs[mnt - nFrom] + L * Math.exp(-NEW.theta * (mnt - SWITCH_MIN));
    for (const s of ns) shocks.push({ tick: Math.floor((s.n * MINUTE) / TICK_MS), at: s.n * MINUTE, dir: s.dir, size: s.size, pick: s.pick });
  }

  return { logs: out, shocks };
}

// ---- hareket katmanı ----

export const LIVE_MS = Date.UTC(2026, 9, 18, 0, 0, 0); // 18 Ekim 03:00, İstanbul
const LIVE_TICK = Math.floor(LIVE_MS / TICK_MS);

const LIVE_PARAMS: Record<Risk, { sigma: number; jumpP: number; jumpMin: number; jumpMax: number }> = {
  // 20 saniyelik tik başına
  low: { sigma: 0.002, jumpP: 0.0003, jumpMin: 0.05, jumpMax: 0.12 },
  mid: { sigma: 0.0035, jumpP: 0.0005, jumpMin: 0.07, jumpMax: 0.18 },
  high: { sigma: 0.0055, jumpP: 0.0008, jumpMin: 0.1, jumpMax: 0.3 },
};
const THETA_Y = 0.004; // yarı ömür ≈ 173 tik ≈ 58 dk
const THETA_J = 0.0004; // yarı ömür ≈ 1733 tik ≈ 9,6 sa
const LIVE_WARMUP = 75_000; // θ_j · warmup = 30

function liveLayer(id: string, from: number, to: number): { add: Float64Array; jumps: Shock[] } {
  const add = new Float64Array(Math.max(0, to - from + 1));
  const jumps: Shock[] = [];
  if (to < LIVE_TICK) return { add, jumps };
  const p = LIVE_PARAMS[STOCK_BY_ID[id].risk];
  const seed = strHash(SECRET + ":canli:" + id);
  const start = Math.max(LIVE_TICK, Math.floor(Math.max(from, LIVE_TICK) / TICKS_PER_DAY) * TICKS_PER_DAY - LIVE_WARMUP);
  let y = 0;
  let j = 0;
  for (let n = start; n <= to; n++) {
    y = y * (1 - THETA_Y) + p.sigma * gauss(seed, n);
    j = j * (1 - THETA_J);
    if (rand(seed, n, 3) < p.jumpP) {
      const dir: 1 | -1 = rand(seed, n, 4) < 0.5 ? -1 : 1;
      const size = p.jumpMin + (p.jumpMax - p.jumpMin) * rand(seed, n, 5);
      // log cinsinden: çöküşte −%size, sıçramada +%size
      j += dir > 0 ? Math.log(1 + size) : Math.log(1 - size);
      if (n >= from) jumps.push({ tick: n, at: n * TICK_MS, dir, size, pick: rand(seed, n, 6), jump: true });
    }
    if (n >= from) add[n - from] = y + j;
  }
  return { add, jumps };
}

/** 20 saniyelik [from, to] tiklerindeki fiyatlar ve şoklar (her iki uç dahil). */
export function series(id: string, from: number, to: number): { prices: number[]; shocks: Shock[] } {
  const mFrom = Math.floor(from / PER_MIN);
  const mTo = Math.floor(to / PER_MIN);
  const { logs, shocks } = minuteLogs(id, mFrom, mTo);
  const { add, jumps } = liveLayer(id, from, to);
  const prices: number[] = new Array(Math.max(0, to - from + 1));
  for (let n = from; n <= to; n++) prices[n - from] = toPrice(logs[Math.floor(n / PER_MIN) - mFrom] + add[n - from]);
  return { prices, shocks: [...shocks.filter((s) => s.tick >= from && s.tick <= to), ...jumps] };
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
  const text = list[Math.floor(s.pick * list.length)].replace("{n}", stock.name);
  if (!s.jump) return text;
  const pct = Math.round(s.size * 100);
  return s.dir > 0 ? `${text}. Hisse bir anda %${pct} sıçradı.` : `${text}. Hisse bir anda %${pct} çöktü.`;
}

// ---- anlık görüntü (tik başına önbellekli) ----

export type StockQuote = { id: string; price: number; open24h: number; change24h: number; spark: number[] };
export type Snapshot = { tick: number; nextTickAt: number; quotes: StockQuote[]; prices: Record<string, number>; news: NewsItem[] };

let cached: Snapshot | null = null;

const SPARK_STEP = 45; // 24 saatte 96 nokta
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
      news.push({ tick: sh.tick, at: sh.at, stockId: s.id, dir: sh.dir, impact: sh.dir * sh.size, text: headline(s.id, sh) });
    }
  }

  news.sort((a, b) => b.at - a.at);
  cached = { tick, nextTickAt: (tick + 1) * TICK_MS, quotes, prices, news: news.slice(0, 12) };
  return cached;
}

export type Range = "1g" | "1h" | "1a";

const RANGE: Record<Range, { ticks: number; step: number }> = {
  "1g": { ticks: TICKS_PER_DAY, step: 15 }, // 1 gün, 5 dk aralıklı
  "1h": { ticks: TICKS_PER_DAY * 7, step: 180 }, // 1 hafta, saatlik
  "1a": { ticks: TICKS_PER_DAY * 30, step: 720 }, // 1 ay, 4 saatlik
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
