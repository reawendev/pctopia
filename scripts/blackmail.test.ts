import assert from "node:assert/strict";
import {
  caughtFine, dossierValue, exposure, fillSecret, freshness, FRESH_HOURS, MAX_SEND_CATCH, maxShareTransfer, MIN_DEMAND, reportCatchChance,
  SECRET_KINDS, SECRET_LIFE_HOURS, sendCatchChance, SEVERITY, STALE_FLOOR,
} from "../src/lib/game/blackmail";
import { OP_BY_ID, OP_SECRET, OPS } from "../src/lib/game/ops";
import { EVENTS } from "../src/lib/server/social";

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 27, 12);

// Tazelik: ilk 24 saat tam, sonra düşer, 72 saatte biter
assert.equal(freshness(t0, t0), 1);
assert.equal(freshness(t0, t0 + FRESH_HOURS * H), 1);
assert.ok(Math.abs(freshness(t0, t0 + (SECRET_LIFE_HOURS - 0.001) * H) - STALE_FLOOR) < 0.01);
assert.equal(freshness(t0, t0 + SECRET_LIFE_HOURS * H), 0);
assert.ok(freshness(t0, t0 + 48 * H) < 1 && freshness(t0, t0 + 48 * H) > STALE_FLOOR);

// Değer: ağırlıkla artar, tazelikle düşer, en az MIN_DEMAND, bayat dosya değersiz
assert.equal(dossierValue(3, 1_000_000, 1), 100_000);
assert.equal(dossierValue(1, 1_000_000, 1), 20_000);
assert.ok(dossierValue(2, 1_000_000, 1) > dossierValue(2, 1_000_000, 0.5));
assert.equal(dossierValue(1, 0, 1), MIN_DEMAND);
assert.equal(dossierValue(3, 1_000_000, 0), 0);

// Yakalanma: ağırlık, açgözlülük ve seri şantaj artırır; tavanı var
assert.equal(sendCatchChance(1, 1000, 1000, false), SEVERITY[1].sendCatch);
assert.ok(sendCatchChance(3, 1000, 1000, false) > sendCatchChance(1, 1000, 1000, false));
assert.ok(sendCatchChance(2, 3000, 1000, false) > sendCatchChance(2, 1000, 1000, false));
assert.ok(sendCatchChance(2, 1000, 1000, true) > sendCatchChance(2, 1000, 1000, false));
assert.equal(sendCatchChance(3, 1e9, 1000, true), MAX_SEND_CATCH);
assert.equal(sendCatchChance(2, 500, 1000, false), SEVERITY[2].sendCatch, "az istemek riski düşürmez, artırmaz");
assert.ok(reportCatchChance(true) > reportCatchChance(false) && reportCatchChance(true) <= 0.9);
assert.equal(caughtFine(100), 2000);
assert.equal(caughtFine(54_321), 54_300);

// Açığa çıkma: ihbarda etki yarıya iner
for (const s of [1, 2, 3] as const) {
  const full = exposure(s, false);
  const self = exposure(s, true);
  assert.ok(full.rep < 0 && self.rep < 0 && self.rep > full.rep);
  assert.ok(self.demand > full.demand && self.hours < full.hours);
}

// Hisse: kurucu %51'in altına inemez
assert.equal(maxShareTransfer(1000, 1000), 490);
assert.equal(maxShareTransfer(600, 1100), 39);
assert.equal(maxShareTransfer(500, 1000), 0);

// Sır metinleri: yer tutucu kalmaz
for (const [k, v] of Object.entries(SECRET_KINDS)) {
  const a = fillSecret(v.summary, { company: "Aslan Bilişim", target: "Kartal Tekno" });
  const b = fillSecret(v.headline, { company: "Aslan Bilişim", target: "Kartal Tekno" });
  assert.ok(!/[{}]/.test(a + b), k);
  assert.ok(b.includes("Aslan Bilişim"), `${k}: başlıkta sırrın sahibi geçmeli`);
}

// Operasyonlar: dedektif var, sır bırakan operasyonların türü tanımlı
assert.ok(OP_BY_ID.dig);
assert.equal(OP_SECRET.dig, undefined, "dedektif sır bırakmaz");
for (const op of OPS) if (op.id !== "dig") assert.ok(OP_SECRET[op.id] && SECRET_KINDS[OP_SECRET[op.id]!], op.id);

// Haber şablonları
for (const e of ["scandal", "scandal_self", "blackmail_caught", "blackmail_unknown", "blackmail_standoff"] as const) assert.ok(EVENTS[e].texts.length > 0, e);

console.log("blackmail.test: tamam");
