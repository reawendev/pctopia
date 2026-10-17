import assert from "node:assert/strict";
import {
  fairValue, isBottlenecked, isValidParts, pendingSales, performanceScore, priceFactor, QUALITIES, salesRate, SLOTS,
  unitCost, verdict, type Parts,
} from "../src/lib/game/workshop";
import {
  ACTIVITIES, activityGain, effectiveAffection, NPCS, perksFrom, proposalChance, stageOf,
} from "../src/lib/game/life";

// ---- Atölye ----
const low: Parts = { cpu: "low", gpu: "low", ram: "low", ssd: "low" };
const high: Parts = { cpu: "high", gpu: "high", ram: "high", ssd: "high" };
const unbalanced: Parts = { cpu: "low", gpu: "high", ram: "mid", ssd: "mid" };

assert.ok(isValidParts(low) && !isValidParts({ ...low, cpu: "ultra" }));
assert.equal(unitCost(low), 310);
assert.equal(unitCost(high), 1650);
assert.equal(unitCost(low, 0.1), 279);

// Her kombinasyonda adil değer maliyetin üstünde (dengeli parçalarda en az %20 kâr payı)
for (const cpu of QUALITIES) for (const gpu of QUALITIES) for (const ram of QUALITIES) for (const ssd of QUALITIES) {
  const p: Parts = { cpu, gpu, ram, ssd };
  const fair = fairValue(p, 50);
  assert.ok(fair > unitCost(p), `adil değer maliyetin üstünde: ${JSON.stringify(p)}`);
  if (!isBottlenecked(p)) assert.ok(fair / unitCost(p) >= 1.2, `kâr payı ${fair}/${unitCost(p)}`);
}
assert.ok(isBottlenecked(unbalanced) && !isBottlenecked(high));
assert.ok(fairValue(high, 100) > fairValue(high, 50) && fairValue(high, 50) > fairValue(high, 0), "itibar değeri artırır");
assert.ok(performanceScore(high) > performanceScore(low));

// Talep eğrisi: ucuz daha çok satar, adil değerin 1,5 katı üstünde satış yok
const fair = fairValue(low, 50);
assert.ok(priceFactor(fair * 0.8, fair) > priceFactor(fair, fair));
assert.ok(priceFactor(fair, fair) > priceFactor(fair * 1.2, fair));
assert.equal(priceFactor(fair * 1.51, fair), 0, "fahiş fiyatta satış olmamalı");
assert.equal(priceFactor(fair * 0.1, fair), priceFactor(fair * 0.5, fair), "çok ucuzlatmak sınırsız talep getirmez");
assert.equal(verdict(fair * 1.6, fair), "fahiş");
assert.equal(verdict(fair * 1.2, fair), "pahalı");
assert.equal(verdict(fair, fair), "piyasa");
assert.equal(verdict(fair * 0.8, fair), "uygun");

const r1 = salesRate({ parts: low, price: fair, reputation: 50, stageLevel: 1 });
assert.ok(r1 > 1.5 && r1 < 3, `ekonomik model saatte ~2 satar: ${r1}`);
assert.ok(salesRate({ parts: low, price: fair, reputation: 90, stageLevel: 1 }) > r1, "itibar satışı artırır");
assert.ok(salesRate({ parts: low, price: fair, reputation: 50, stageLevel: 1, demandBonus: 0.1 }) > r1);

// Tembel satış: kesirli birikim, stok sınırı, 12 saat sınırı
const t0 = 1_800_000_000_000;
let s = pendingSales({ rate: 2.5, stock: 100, carry: 0, lastSaleMs: t0, nowMs: t0 + 3_600_000 });
assert.equal(s.sold, 2);
assert.ok(Math.abs(s.carry - 0.5) < 1e-9);
s = pendingSales({ rate: 2.5, stock: 100, carry: 0.5, lastSaleMs: t0, nowMs: t0 + 3_600_000 });
assert.equal(s.sold, 3);
s = pendingSales({ rate: 10, stock: 4, carry: 0, lastSaleMs: t0, nowMs: t0 + 3_600_000 });
assert.deepEqual(s, { sold: 4, carry: 0 });
s = pendingSales({ rate: 1, stock: 1000, carry: 0, lastSaleMs: t0, nowMs: t0 + 100 * 3_600_000 });
assert.equal(s.sold, 12);
s = pendingSales({ rate: 1, stock: 10, carry: 0, lastSaleMs: t0, nowMs: t0 - 5000 });
assert.equal(s.sold, 0);

// ---- Hayat ----
assert.equal(stageOf(10, false, false), "tanisik");
assert.equal(stageOf(25, false, false), "arkadas");
assert.equal(stageOf(45, false, false), "flort");
assert.equal(stageOf(70, false, false), "sevgili");
assert.equal(stageOf(70, true, false), "nisanli");
assert.equal(stageOf(70, true, true), "evli");

const H = 3_600_000;
assert.equal(effectiveAffection(50, t0, t0 + 7 * H, false), 50);
assert.equal(effectiveAffection(50, t0, t0 + 24 * H, false), 47);
assert.equal(effectiveAffection(45, t0, t0 + 1000 * H, true), 40, "nişanlı/evliyken 40'ın altına düşmez");
assert.equal(effectiveAffection(5, t0, t0 + 1000 * H, false), 0);

const selin = NPCS.find((n) => n.id === "selin")!;
const yemek = ACTIVITIES.find((a) => a.id === "yemek")!;
const yuruyus = ACTIVITIES.find((a) => a.id === "yuruyus")!;
assert.ok(activityGain(selin, yemek, 0.5) > activityGain(selin, yuruyus, 0.5), "sevdiği etkinlik daha çok yakınlaştırır");
assert.ok(activityGain(selin, yuruyus, 0) < yuruyus.gain, "sevmediği etkinlik daha az yakınlaştırır");

assert.ok(proposalChance(80) < proposalChance(95));
assert.ok(proposalChance(100) <= 0.95);

// Yararlar: arkadaş altında yok, partner iki kat, üst sınır var
const p0 = perksFrom([{ npcId: "selin", affection: 10, engaged: false, married: false }]);
assert.equal(p0.offer, 0);
const p1 = perksFrom([{ npcId: "selin", affection: 30, engaged: false, married: false }]);
const p2 = perksFrom([{ npcId: "selin", affection: 70, engaged: false, married: false }]);
assert.ok(p2.offer === p1.offer * 2 && p1.offer > 0);
const all = perksFrom(NPCS.map((n) => ({ npcId: n.id, affection: 100, engaged: true, married: true })));
assert.ok(all.offer <= 0.12 && all.shield <= 0.5 && all.parts <= 0.15 && all.demand <= 0.25);

// Karakterlerin hepsi yetişkin, kimlikler benzersiz ve ASCII
assert.ok(NPCS.every((n) => n.age >= 21));
assert.equal(new Set(NPCS.map((n) => n.id)).size, NPCS.length);
assert.ok(NPCS.every((n) => /^[a-z]+$/.test(n.id)));
assert.ok(SLOTS.length === 4);

console.log("rules: tüm testler geçti");
