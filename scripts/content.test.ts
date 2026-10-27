import assert from "node:assert/strict";
import {
  ACCESSORIES, AGES, DEFAULT_CHARACTER, GENDERS, HAIR_COLORS, HAIR_STYLES, isValidCharacter,
  LOGO_BG, LOGO_COLORS, LOGO_SHAPES, LOGO_SYMBOLS, SKINS, SUITS,
} from "../src/lib/game/config";
import { logoPrompt, portraitPrompt } from "../src/lib/game/prompts";
import { dayNumber, STAGES, stageFor } from "../src/lib/game/stages";
import { formatCompactMoney } from "../src/lib/game/economy";

// Her seçenek kombinasyonu tam bir İngilizce tarife dönüşmeli (eşlenmemiş renk kalmamalı)
for (const skin of SKINS) for (const hair of HAIR_STYLES) for (const hairColor of HAIR_COLORS)
  for (const suit of SUITS) for (const accessory of ACCESSORIES) for (const gender of GENDERS) for (const age of AGES) {
    const { description } = portraitPrompt({ skin, hair, hairColor, suit, accessory, gender, age });
    assert.ok(!/undefined|#[0-9a-f]{3,6}/i.test(description), description);
    assert.ok(description.length < 1000);
  }
for (const shape of LOGO_SHAPES) for (const symbol of LOGO_SYMBOLS) for (const color of LOGO_COLORS) for (const bg of LOGO_BG) {
  const { description } = logoPrompt({ shape, symbol, color, bg });
  assert.ok(!/undefined|#[0-9a-f]{3,6}/i.test(description), description);
}

// Eski kayıtlar (cinsiyet/yaş yok) hâlâ geçerli; yanlış değer reddedilir
const { gender, age, ...old } = DEFAULT_CHARACTER;
assert.ok(isValidCharacter(old));
assert.ok(!isValidCharacter({ ...DEFAULT_CHARACTER, gender: "robot" }));

// Kariyer basamakları
assert.equal(stageFor(0).stage.title, STAGES[0].title);
assert.equal(stageFor(9_999).stage.level, 1);
assert.equal(stageFor(10_000).stage.level, 2);
assert.equal(stageFor(5e9).stage.level, 7);
assert.equal(stageFor(5e9).next, null);
for (const nw of [0, 1_000, 5_000, 50_000, 3e6, 7e8]) {
  const p = stageFor(nw).progress;
  assert.ok(p >= 0 && p <= 1, `progress ${nw}`);
}
assert.ok(stageFor(50_000).progress > stageFor(20_000).progress);

assert.equal(dayNumber(new Date().toISOString()), 1);
assert.equal(dayNumber(new Date(Date.now() - 2.5 * 86_400_000).toISOString()), 3);
assert.equal(dayNumber(null), null);

assert.equal(formatCompactMoney(1_250_000), "$1,25 milyon");
assert.equal(formatCompactMoney(-1_110), "−$1,11 bin");
assert.equal(formatCompactMoney(926), "$926");

console.log("content: tüm testler geçti");

// ---- Yeni görünüm seçenekleri (avatar) ----
{
  const C = require("../src/lib/game/config");
  const base = C.DEFAULT_CHARACTER;
  assert.ok(C.isValidCharacter(base), "varsayılan geçerli");
  // Eski kayıt (yeni alanlar yok) geçerli kalır, eski "ayrıntı" yeni alanlara çevrilir
  const old = { skin: C.SKINS[0], hair: "side", hairColor: C.HAIR_COLORS[0], suit: C.SUITS[0], accessory: "beard" };
  assert.ok(C.isValidCharacter(old));
  assert.equal(C.facialOf(old), "beard");
  assert.equal(C.eyewearOf({ ...old, accessory: "glasses" }), "glasses");
  const lists: [string, readonly string[]][] = [
    ["hair", C.HAIR_STYLES], ["eyes", C.EYES], ["brows", C.BROWS], ["mouth", C.MOUTHS], ["facial", C.FACIAL], ["eyewear", C.EYEWEAR],
    ["headwear", C.HEADWEAR], ["earring", C.EARRINGS], ["outfit", C.OUTFITS], ["tie", C.TIE_COLORS], ["backdrop", C.BACKDROPS], ["age", C.AGES], ["gender", C.GENDERS],
  ];
  for (const [k, vs] of lists) {
    for (const v of vs) {
      const spec = { ...base, [k]: v };
      assert.ok(C.isValidCharacter(spec), `${k}=${v} geçerli`);
      const { description } = portraitPrompt(spec);
      assert.ok(!/undefined|null/.test(description), `${k}=${v}: ${description}`);
    }
    assert.ok(!C.isValidCharacter({ ...base, [k]: "bilinmeyen" }), `${k} listede olmayan reddedilir`);
  }
}
console.log("avatar seçenekleri: tamam");
