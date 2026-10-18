// Süreli şirket etkileri (krizler ve ileride gizli operasyonlar) — YALNIZCA SUNUCU.

import { isMissingTable } from "./company";
import { db, HttpError } from "./supabase";

export type EffectKind = "demand" | "parts" | "halt";
export type EffectRow = { id: number; company_id: string; kind: EffectKind; value: number; label: string; source: string; expires_at: string };
export type EffectSum = { demand: number; parts: number; halt: EffectRow | null; list: EffectRow[] };

const EMPTY = (): EffectSum => ({ demand: 0, parts: 0, halt: null, list: [] });

/** Şirketlerin şu an süren etkileri. 010 yoksa boş. */
export async function loadEffects(companyIds: string[]): Promise<Map<string, EffectSum>> {
  const out = new Map<string, EffectSum>();
  for (const id of companyIds) out.set(id, EMPTY());
  if (companyIds.length === 0) return out;
  const { data, error } = await db().from("company_effects").select("*").in("company_id", companyIds).gt("expires_at", new Date().toISOString());
  if (error) {
    if (isMissingTable(error)) return out;
    throw new HttpError(500, error.message);
  }
  for (const r of (data ?? []) as EffectRow[]) {
    const s = out.get(r.company_id)!;
    s.list.push(r);
    if (r.kind === "demand") s.demand += Number(r.value);
    else if (r.kind === "parts") s.parts += Number(r.value);
    else if (r.kind === "halt" && (!s.halt || r.expires_at > s.halt.expires_at)) s.halt = r;
  }
  for (const s of out.values()) s.demand = Math.max(-1, s.demand);
  return out;
}

export async function addEffect(companyId: string, kind: EffectKind, value: number, hours: number, label: string, source = "kriz"): Promise<void> {
  const { error } = await db()
    .from("company_effects")
    .insert({ company_id: companyId, kind, value, label, source, expires_at: new Date(Date.now() + hours * 3_600_000).toISOString() });
  if (error && !isMissingTable(error)) throw new HttpError(500, error.message);
}

/** İstemciye: süren etkiler. */
export function effectsView(s: EffectSum | undefined) {
  return (s?.list ?? []).map((e) => ({ kind: e.kind, value: Number(e.value), label: e.label, expiresAt: e.expires_at }));
}
