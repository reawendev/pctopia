import { companyNetWorth, facilityWorth, loadAllAssets } from "@/lib/server/company";
import { snapshot } from "@/lib/server/market";
import { db, handle, HttpError, requireAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  await requireAdmin(req);

  const [users, profiles, companies, eq] = await Promise.all([
    db().auth.admin.listUsers({ page: 1, perPage: 500 }),
    db().from("profiles").select("id, is_admin, banned, created_at"),
    db().from("companies").select("*"),
    loadAllAssets(),
  ]);
  if (users.error) throw new HttpError(500, users.error.message);
  if (profiles.error || companies.error) {
    throw new HttpError(500, (profiles.error || companies.error)!.message);
  }

  const prices = snapshot().prices;
  const companyByOwner = new Map((companies.data ?? []).map((c) => [c.owner_id, c]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));

  const players = users.data.users.map((u) => {
    const c = companyByOwner.get(u.id);
    const p = profileById.get(u.id);
    return {
      userId: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      isAdmin: !!p?.is_admin,
      banned: !!p?.banned,
      company: c
        ? {
            id: c.id,
            name: c.name,
            founderName: c.founder_name,
            cash: Number(c.cash),
            netWorth: companyNetWorth(c.cash, eq.get(c.id)?.owned ?? {}, eq.get(c.id)?.holdings ?? {}, prices, (eq.get(c.id)?.extra ?? 0) + facilityWorth(c)),
          }
        : null,
    };
  });

  const withCompany = players.filter((p) => p.company);
  return {
    stats: {
      users: players.length,
      companies: withCompany.length,
      banned: players.filter((p) => p.banned).length,
      totalCash: withCompany.reduce((s, p) => s + p.company!.cash, 0),
    },
    players: players.sort((a, b) => (b.company?.netWorth ?? -1) - (a.company?.netWorth ?? -1)),
  };
});
