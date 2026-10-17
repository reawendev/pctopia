import assert from "node:assert/strict";
import { EQUIPMENT, OFFLINE_CAP_HOURS } from "../src/lib/game/config";
import { assetValue, incomePerHour, netWorth, pendingIncome, unitCost } from "../src/lib/game/economy";

// Fiyat artışı
assert.equal(unitCost("used-pc", 0), 400);
assert.equal(unitCost("used-pc", 1), 460);
assert.ok(unitCost("used-pc", 10) > unitCost("used-pc", 9));

// Gelir
assert.equal(incomePerHour({}), 0);
assert.equal(incomePerHour({ "used-pc": 3 }), 120);

// Birikim ve çevrimdışı üst sınır
const t0 = 1_700_000_000_000;
assert.equal(pendingIncome({ "used-pc": 1 }, t0, t0 + 3_600_000), 40);
assert.equal(pendingIncome({ "used-pc": 1 }, t0, t0 + 100 * 3_600_000), 40 * OFFLINE_CAP_HOURS);
assert.equal(pendingIncome({ "used-pc": 1 }, t0, t0 - 5000), 0, "gelecek zaman negatif gelir üretmemeli");

// Net değer
assert.equal(assetValue({ "used-pc": 1 }), 200);
assert.equal(netWorth(1000, { "used-pc": 2 }), 1000 + Math.floor((400 + 460) * 0.5));

// Denge: her kademenin geri ödeme süresi 8-20 saat arasında ve yükseliyor
let prev = 0;
for (const e of EQUIPMENT) {
  const payback = e.baseCost / e.incomePerHour;
  assert.ok(payback >= 8 && payback <= 20, `${e.id} geri ödeme ${payback}`);
  assert.ok(payback >= prev, `${e.id} geri ödeme sırası`);
  prev = payback;
}

console.log("economy: tüm testler geçti");
