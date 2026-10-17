// Sezon bilgisi. Tablo yoksa (006 çalıştırılmadıysa) null döner.

import { isMissingTable } from "./company";
import { db, HttpError } from "./supabase";

export type SeasonRow = { id: number; number: number; started_at: string; ended_at: string | null; champions: any[] };

/** Bir sonraki pazartesi 00:00 (İstanbul, UTC+3). Önerilen sezon bitişi. */
export function nextMondayIstanbul(now = Date.now()): number {
  const tr = new Date(now + 3 * 3_600_000); // İstanbul saatine kaydır
  const day = tr.getUTCDay(); // 0 pazar, 1 pazartesi
  const daysToMon = (8 - day) % 7 || 7;
  const midnight = Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate() + daysToMon);
  return midnight - 3 * 3_600_000;
}

export async function loadSeasons(): Promise<{ current: SeasonRow | null; past: SeasonRow[] } | null> {
  const { data, error } = await db().from("seasons").select("*").order("number", { ascending: false }).limit(30);
  if (error) {
    if (isMissingTable(error)) return null;
    throw new HttpError(500, error.message);
  }
  const rows = (data ?? []) as SeasonRow[];
  return { current: rows.find((r) => !r.ended_at) ?? null, past: rows.filter((r) => r.ended_at) };
}
