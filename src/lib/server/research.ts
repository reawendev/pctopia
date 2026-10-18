// Ar-Ge — sunucu tarafı: projeler, patentler ve şirket başına etkiler.

import { activeFrom, effectText, patentHolder, PATENT_HOURS, TECH_BY_ID, techEffects, TECHS, type ResearchRow } from "../game/research";
import { isMissingTable, logEvent } from "./company";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";

/** Bütün şirketlerin Ar-Ge kayıtları (tablo küçüktür: şirket × proje). 009 yoksa null. */
export async function loadResearch(): Promise<ResearchRow[] | null> {
  const { data, error } = await db().from("research").select("company_id, tech_id, started_at, done_at");
  if (error) {
    if (isMissingTable(error)) return null;
    throw new HttpError(500, error.message);
  }
  return (data ?? []).map((r) => ({ companyId: r.company_id, techId: r.tech_id, startedMs: new Date(r.started_at).getTime(), doneMs: new Date(r.done_at).getTime() }));
}

const ZERO = { parts: 0, demand: 0, premium: 0 };

/** Şirketlerin şu anki Ar-Ge etkileri. */
export async function techPerks(companyIds: string[], rows?: ResearchRow[] | null): Promise<Map<string, { parts: number; demand: number; premium: number }>> {
  const all = rows === undefined ? await loadResearch() : rows;
  const now = Date.now();
  const out = new Map<string, { parts: number; demand: number; premium: number }>();
  for (const id of companyIds) out.set(id, all ? techEffects(all, id, now) : { ...ZERO });
  return out;
}

/** Ar-Ge ekranı: her proje için durum. */
export async function researchView(companyId: string, names: (id: string) => string) {
  const rows = await loadResearch();
  if (!rows) return { ready: false as const };
  const now = Date.now();
  const mine = rows.filter((r) => r.companyId === companyId);
  const running = mine.find((r) => r.doneMs > now) ?? null;
  const techs = TECHS.map((t) => {
    const row = mine.find((r) => r.techId === t.id);
    const from = activeFrom(rows, companyId, t.id);
    const holder = t.patent ? patentHolder(rows.filter((r) => r.doneMs <= now), t.id) : null;
    const patentUntil = holder ? holder.doneMs + PATENT_HOURS * 3_600_000 : null;
    const patentActive = !!holder && patentUntil! > now;
    const others = t.patent ? rows.filter((r) => r.techId === t.id && r.companyId !== companyId && r.doneMs > now).length : 0;
    let status: "locked" | "available" | "running" | "waiting" | "active";
    if (row && row.doneMs > now) status = "running";
    else if (row && from !== null && from > now) status = "waiting"; // bitti ama rakibin patenti sürüyor
    else if (row) status = "active";
    else if (t.requires && !mine.some((r) => r.techId === t.requires && r.doneMs <= now)) status = "locked";
    else status = "available";
    return {
      ...t,
      status,
      startedAt: row ? new Date(row.startedMs).toISOString() : null,
      doneAt: row ? new Date(row.doneMs).toISOString() : null,
      activeFrom: from !== null ? new Date(from).toISOString() : null,
      patent: t.patent
        ? {
            holder: holder ? { id: holder.companyId, name: names(holder.companyId), mine: holder.companyId === companyId } : null,
            until: patentActive ? new Date(patentUntil!).toISOString() : null,
            racing: others, // aynı patent için çalışan rakip sayısı
          }
        : null,
    };
  });
  return { ready: true as const, running: running ? running.techId : null, techs, effects: techEffects(rows, companyId, now) };
}

/** Biten projeleri günlüğe yazar; patenti alan şirket için haber çıkar. Bir kez çalışır (announced). */
export async function syncResearch(companyId: string, companyName: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db().from("research").select("tech_id").eq("company_id", companyId).eq("announced", false).lte("done_at", now);
  if (error) {
    if (isMissingTable(error)) return false;
    throw new HttpError(500, error.message);
  }
  if (!data?.length) return false;
  const rows = (await loadResearch()) ?? [];
  for (const r of data) {
    const { data: upd } = await db().from("research").update({ announced: true }).eq("company_id", companyId).eq("tech_id", r.tech_id).eq("announced", false).select("tech_id");
    if (!upd?.length) continue; // başka bir istek zaten duyurdu
    const t = TECH_BY_ID[r.tech_id];
    if (!t) continue;
    const holder = t.patent ? patentHolder(rows, t.id) : null;
    if (t.patent && holder?.companyId === companyId) {
      await logEvent(companyId, "research", `Ar-Ge tamamlandı: “${t.name}”. Patent ${PATENT_HOURS} saat boyunca senin.`);
      await postAbout(companyId, "patent", { company: companyName, tech: t.name });
    } else if (t.patent) {
      await logEvent(companyId, "research", `Ar-Ge tamamlandı: “${t.name}”. Rakibin patenti bitince kullanılabilecek.`);
    } else {
      await logEvent(companyId, "research", `Ar-Ge tamamlandı: “${t.name}”. Etkisi: ${effectText(t.effect)}.`);
    }
  }
  return true;
}
