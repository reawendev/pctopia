import assert from "node:assert/strict";
import { buyTotal, maxAffordable, portfolioValue, sellTotal, STOCKS, TICKS_PER_DAY } from "../src/lib/game/market";
import { currentTick, history, LIVE_MS, priceAt, series, snapshot, SWITCH_MS } from "../src/lib/server/market";

// Komisyon
assert.equal(buyTotal(10, 100), 1005);
assert.equal(sellTotal(10, 100), 995);
assert.ok(buyTotal(1, 0.5) >= 1, "alış en az 1$ tutmalı");

// En fazla alınabilecek adet bütçeyi aşmamalı
for (const [cash, price] of [[1000, 99.99], [250_000, 431.07], [5, 10], [1_000_000, 0.73]] as const) {
  const n = maxAffordable(cash, price);
  assert.ok(buyTotal(n, price) <= cash, `max ${cash}/${price}`);
  assert.ok(buyTotal(n + 1, price) > cash, `max+1 ${cash}/${price}`);
}

assert.equal(portfolioValue({ A: { shares: 3, costBasis: 0 } }, { A: 10.5 }), 31);

// Fiyat modeli: aynı tik, farklı pencerelerle hesaplansa da aynı fiyatı vermeli
const now = currentTick();
for (const s of STOCKS) {
  const direct = priceAt(s.id, now);
  const viaDay = series(s.id, now - TICKS_PER_DAY, now).prices.at(-1);
  const viaMonth = series(s.id, now - TICKS_PER_DAY * 30, now).prices.at(-1);
  assert.equal(direct, viaDay, `${s.id} gün penceresi`);
  assert.equal(direct, viaMonth, `${s.id} ay penceresi`);
  assert.ok(direct > 0);

  // 90 günde fiyat tabanın çok dışına kaçmamalı (ortalamaya dönüş)
  const ps = series(s.id, now - TICKS_PER_DAY * 90, now).prices;
  let lo = Infinity, hi = -Infinity;
  for (const p of ps) { if (p < lo) lo = p; if (p > hi) hi = p; }
  assert.ok(lo > s.basePrice * 0.3 && hi < s.basePrice * 3, `${s.id} aralık`);
}

// Anlık görüntü
const snap = snapshot();
assert.equal(snap.quotes.length, STOCKS.length);
assert.ok(snap.nextTickAt > Date.now());
assert.ok(snap.news.length <= 12);
for (const q of snap.quotes) assert.equal(q.price, snap.prices[q.id]);

// Geçmiş
const h = history("ANKA", "1h");
assert.ok(h.length > 150 && h.length < 200);

// 5 dk → 1 dk geçişi kesintisiz (tikler artık 20 saniye: 5 dakika = 15 tik)
const S = SWITCH_MS / 20_000;
for (const st of STOCKS) {
  const { prices: around } = series(st.id, S - 30, S + 30);
  assert.equal(new Set(around.slice(0, 15)).size, 1, `${st.id} eski blok sabit`);
  for (let i = 31; i < around.length; i++) assert.ok(Math.abs(around[i] / around[i - 1] - 1) < 0.05, `${st.id} sıçrama`);
}

// Hareket katmanı: LIVE anında kopma yok, sonrasında her 20 saniyede kıpırdıyor, sıçrama/çöküş haberi var
const LT = LIVE_MS / 20_000;
for (const st of STOCKS) {
  const { prices: a } = series(st.id, LT - 3, LT + 3);
  assert.ok(Math.abs(a[3] / a[2] - 1) < 0.03, `${st.id} canlı geçişte kopma`);
  const { prices: b } = series(st.id, LT + 1000, LT + 1180);
  let moves = 0;
  for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) moves++;
  assert.ok(moves > 150, `${st.id} 20 sn hareket ${moves}`);
  const { prices: w } = series(st.id, LT, LT + TICKS_PER_DAY * 60);
  let lo = Infinity, hi = -Infinity;
  for (const p of w) { if (p < lo) lo = p; if (p > hi) hi = p; }
  assert.ok(lo > st.basePrice * 0.2 && hi < st.basePrice * 5, `${st.id} 60 günlük aralık ${lo}-${hi}`);
}
let jumps = 0;
for (const st of STOCKS) jumps += series(st.id, LT, LT + TICKS_PER_DAY * 7).shocks.filter((x) => x.jump).length;
assert.ok(jumps > 50 && jumps < 400, `haftalık sıçrama/çöküş ${jumps}`);
console.log(`  bir haftada ${jumps} sıçrama/çöküş (8 hisse)`);
assert.equal(h.at(-1)!.p, snap.prices.ANKA);

console.log("market: tüm testler geçti");
