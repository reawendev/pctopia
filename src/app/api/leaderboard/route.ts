import { companyNetWorth, loadAllAssets } from "@/lib/server/company";
import { snapshot } from "@/lib/server/market";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireUser(req);

  const [{ data: companies, error }, assets] = await Promise.all([
    db().from("companies").select("id, owner_id, name, founder_name, logo, cash"),
    loadAllAssets(),
  ]);
  if (error) throw new HttpError(500, error.message);
  const prices = snapshot().prices;

  const ranked = (companies ?? [])
    .map((c) => {
      const a = assets.get(c.id) ?? { owned: {}, holdings: {} };
      return {
        id: c.id,
        name: c.name,
        founderName: c.founder_name,
        logo: c.logo,
        netWorth: companyNetWorth(c.cash, a.owned, a.holdings, prices),
        isMe: c.owner_id === user.id,
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  return { total: ranked.length, top: ranked.slice(0, 50), me: ranked.find((c) => c.isMe) ?? null };
});
