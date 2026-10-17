// Hayat (ilişkiler) — sunucu tarafı yardımcıları.

import { effectiveAffection, perksFrom, type Perk, type RelationState } from "../game/life";
import { isMissingTable } from "./company";
import { db, HttpError } from "./supabase";

export type RelationRow = {
  company_id: string;
  npc_id: string;
  affection: number;
  engaged: boolean;
  married: boolean;
  last_activity_at: string;
  last_date_at: string | null;
  met_at: string;
};

/** İlişkileri, zamanla azalmış yakınlıkla birlikte yükler. Tablo yoksa boş döner. */
export async function loadRelations(companyId: string, now = Date.now()): Promise<(RelationRow & { effective: number })[]> {
  const { data, error } = await db().from("relationships").select("*").eq("company_id", companyId);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  return ((data ?? []) as RelationRow[]).map((r) => ({
    ...r,
    effective: effectiveAffection(r.affection, new Date(r.last_activity_at).getTime(), now, r.engaged || r.married),
  }));
}

export function toStates(rows: (RelationRow & { effective: number })[]): RelationState[] {
  return rows.map((r) => ({ npcId: r.npc_id, affection: r.effective, engaged: r.engaged, married: r.married }));
}

/** Şirketin ilişkilerden gelen yararları (teklif, kriz kalkanı, basın, parça, talep). */
export async function companyPerks(companyId: string): Promise<Record<Perk, number>> {
  return perksFrom(toStates(await loadRelations(companyId)));
}
