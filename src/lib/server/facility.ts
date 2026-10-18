// Tesis büyütme — sunucu tarafı.

import { formatMoney } from "../game/economy";
import { effectiveLevel, facility, FACILITIES } from "../game/facility";
import { logEvent, type CompanyRow } from "./company";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";

/** İnşaatı biten tesisi kesinleştirir ve bir kez duyurur. */
export async function syncFacility(c: CompanyRow): Promise<boolean> {
  if (!c.facility_target || !c.facility_ready_at || new Date(c.facility_ready_at).getTime() > Date.now()) return false;
  const { data: lvl, error } = await db().rpc("facility_finish", { p_company: c.id });
  if (error) {
    if (/facility_finish/.test(error.message)) return false; // 010 yok
    throw new HttpError(500, error.message);
  }
  if (!lvl) return false;
  const f = facility(lvl);
  await logEvent(c.id, "facility", `Yeni tesis açıldı: ${f.name}. Depo ${f.maxStock.toLocaleString("tr-TR")} adet, tek seferde ${f.batch.toLocaleString("tr-TR")} adet üretim.`);
  await postAbout(c.id, "facility", { company: c.name, facility: f.name.toLocaleLowerCase("tr") });
  return true;
}

export function facilityView(c: CompanyRow) {
  const now = Date.now();
  const level = effectiveLevel(c.facility_level, c.facility_target, c.facility_ready_at, now);
  const building = c.facility_target && c.facility_ready_at && new Date(c.facility_ready_at).getTime() > now ? { level: c.facility_target, readyAt: c.facility_ready_at } : null;
  return { ready: c.facility_level !== undefined, level, building, levels: FACILITIES };
}

export async function upgradeFacility(c: CompanyRow): Promise<string> {
  const v = facilityView(c);
  if (!v.ready) throw new HttpError(503, "Tesis için veritabanında 010_tesis_kriz.sql çalıştırılmalı");
  if (v.building) throw new HttpError(409, "İnşaat zaten sürüyor");
  const next = FACILITIES.find((f) => f.level === v.level + 1);
  if (!next) throw new HttpError(400, "Tesisin en üst seviyede");
  const { error } = await db().rpc("facility_upgrade", { p_company: c.id, p_target: next.level, p_cost: next.cost, p_hours: next.hours });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Bu tesis için kasada ${formatMoney(next.cost)} olmalı`);
    if (/sürüyor/.test(error.message)) throw new HttpError(409, "İnşaat zaten sürüyor");
    throw new HttpError(500, error.message);
  }
  await logEvent(c.id, "facility", `İnşaat başladı: ${next.name}, ${formatMoney(next.cost)}. ${next.hours} saat sürecek.`, -next.cost);
  return `${next.name} inşaatı başladı. ${next.hours} saat sonra hazır.`;
}
