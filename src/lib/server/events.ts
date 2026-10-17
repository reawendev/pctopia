// Dünya olayı takvimi — YALNIZCA SUNUCU.
// Her 8 saatlik dilimin olayı gizli tohumdan deterministik seçilir: herkes aynı olayı görür,
// veritabanı veya cron gerekmez, gelecekteki olaylar tahmin edilemez.

import { EVENT_SLOT_MS, WORLD_EVENTS, type WorldEvent } from "../game/events";

const SECRET = process.env.MARKET_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || "pctopia-dev-seed";
const EPOCH = Date.UTC(2026, 9, 17, 21, 0, 0); // 18 Ekim 00:00 İstanbul: dilim sınırları Türkiye saatine göre 00/08/16

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export type ActiveEvent = WorldEvent & { slot: number; startsAt: number; endsAt: number };

export function eventForSlot(slot: number): ActiveEvent {
  const total = WORLD_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = (hash(`${SECRET}:event:${slot}`) / 4294967296) * total;
  let pick = WORLD_EVENTS[0];
  for (const e of WORLD_EVENTS) {
    r -= e.weight;
    if (r < 0) {
      pick = e;
      break;
    }
  }
  const startsAt = EPOCH + slot * EVENT_SLOT_MS;
  return { ...pick, slot, startsAt, endsAt: startsAt + EVENT_SLOT_MS };
}

export function currentEvent(now = Date.now()): ActiveEvent {
  const slot = Math.floor((now - EPOCH) / EVENT_SLOT_MS);
  // Yalnızca test/geliştirme: olayı sabitlemek için (ör. EVENT_OVERRIDE=calm). Yayında tanımlama.
  const forced = process.env.EVENT_OVERRIDE ? WORLD_EVENTS.find((e) => e.id === process.env.EVENT_OVERRIDE) : undefined;
  if (forced) {
    const startsAt = EPOCH + slot * EVENT_SLOT_MS;
    return { ...forced, slot, startsAt, endsAt: startsAt + EVENT_SLOT_MS };
  }
  return eventForSlot(slot);
}

/** Şu anki ve geçmiş birkaç olay (gelecek gösterilmez). */
export function recentEvents(count = 4, now = Date.now()): ActiveEvent[] {
  const cur = Math.floor((now - EPOCH) / EVENT_SLOT_MS);
  return Array.from({ length: count }, (_, i) => (i === 0 ? currentEvent(now) : eventForSlot(cur - i)));
}
