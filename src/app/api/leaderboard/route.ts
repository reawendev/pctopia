import { assetValue, type Owned } from "@/lib/game/economy";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireUser(req);

  const [{ data: companies, error }, { data: eq, error: e2 }] = await Promise.all([
    db().from("companies").select("id, owner_id, name, founder_name, logo, character, cash"),
    db().from("company_equipment").select("company_id, equipment_id, qty"),
  ]);
  if (error || e2) throw new HttpError(500, (error || e2)!.message);

  const ownedBy = new Map<string, Owned>();
  for (const r of eq ?? []) {
    const o = ownedBy.get(r.company_id) ?? {};
    o[r.equipment_id] = r.qty;
    ownedBy.set(r.company_id, o);
  }

  const ranked = (companies ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      founderName: c.founder_name,
      logo: c.logo,
      netWorth: Number(c.cash) + assetValue(ownedBy.get(c.id) ?? {}),
      isMe: c.owner_id === user.id,
    }))
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  return { total: ranked.length, top: ranked.slice(0, 50), me: ranked.find((c) => c.isMe) ?? null };
});
