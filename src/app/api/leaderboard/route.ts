import { companyNetWorth, loadAllAssets } from "@/lib/server/company";
import { snapshot } from "@/lib/server/market";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);

  const [{ data: companies, error }, assets] = await Promise.all([
    // "*": görsel sütunları göç öncesi yoksa da hata vermesin
    db().from("companies").select("*"),
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
        logoUrl: (c.logo_url as string | null) ?? null,
        portraitUrl: (c.portrait_url as string | null) ?? null,
        character: c.character,
        createdAt: c.created_at,
        reputation: (c.reputation as number | undefined) ?? 50,
        netWorth: companyNetWorth(c.cash, a.owned, a.holdings, prices),
        isMe: c.owner_id === user.id,
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  return { total: ranked.length, top: ranked.slice(0, 50), me: ranked.find((c) => c.isMe) ?? null };
});
