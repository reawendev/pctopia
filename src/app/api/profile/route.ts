import { partMultipliers } from "@/lib/game/events";
import { STAFF, STATUS_BY_ID, type Role } from "@/lib/game/finance";
import { NPC_BY_ID, stageOf, STAGE_LABEL, stageRank, effectiveAffection } from "@/lib/game/life";
import { fairValue, segment, verdict } from "@/lib/game/workshop";
import { isMissingTable, loadCompany } from "@/lib/server/company";
import { currentEvent } from "@/lib/server/events";
import { rankCompanies } from "@/lib/server/ranking";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function optional<T>(q: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  return data ?? [];
}

/** Bir şirketin herkese açık profili. */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const ranked = await rankCompanies();
  const r = ranked.find((c) => c.id === id);
  if (!r) throw new HttpError(404, "Şirket bulunamadı");
  const me = await loadCompany(user.id);

  const [models, status, rels, staff] = await Promise.all([
    optional<any>(db().from("pc_models").select("*").eq("company_id", id).eq("listed", true)),
    optional<any>(db().from("status_items").select("*").eq("company_id", id)),
    optional<any>(db().from("relationships").select("*").eq("company_id", id)),
    optional<any>(db().from("employees").select("role").eq("company_id", id)),
  ]);
  const mult = partMultipliers(currentEvent().effects);
  const now = Date.now();
  const people = rels
    .map((x) => {
      const aff = effectiveAffection(x.affection, new Date(x.last_activity_at).getTime(), now, x.engaged || x.married);
      return { npc: NPC_BY_ID[x.npc_id], stage: stageOf(aff, x.engaged, x.married) };
    })
    .filter((p) => p.npc);
  const partner = people.find((p) => stageRank(p.stage) >= stageRank("sevgili"));

  return {
    isMe: me?.company.id === id,
    company: {
      id: r.id,
      name: r.name,
      founderName: r.founderName,
      logo: r.logo,
      logoUrl: r.logoUrl,
      portraitUrl: r.portraitUrl,
      character: r.character,
      createdAt: r.createdAt,
      reputation: r.reputation,
    },
    rank: r.rank,
    total: ranked.length,
    netWorth: r.netWorth,
    products: models.map((m) => {
      const fair = fairValue(m.parts, r.reputation, mult);
      return { id: m.id, name: m.name, price: Number(m.price), fair, verdict: verdict(Number(m.price), fair), segment: segment(m.parts), inStock: m.stock > 0, sold: m.sold_total };
    }),
    belongings: status.map((s) => STATUS_BY_ID[s.item_id]?.name).filter(Boolean),
    partner: partner ? { name: partner.npc.name, job: partner.npc.job, stage: STAGE_LABEL[partner.stage], look: partner.npc.look } : null,
    friends: people.filter((p) => stageRank(p.stage) >= stageRank("arkadas")).length,
    staff: staff.map((s) => STAFF[s.role as Role]?.name).filter(Boolean),
  };
});
