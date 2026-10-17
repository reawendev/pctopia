import { assetValue, type Owned } from "@/lib/game/economy";
import { db, handle, HttpError, requireAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireAdmin(req);

  const [users, profiles, companies, eq] = await Promise.all([
    db().auth.admin.listUsers({ page: 1, perPage: 500 }),
    db().from("profiles").select("id, is_admin, banned, created_at"),
    db().from("companies").select("id, owner_id, name, founder_name, cash, created_at"),
    db().from("company_equipment").select("company_id, equipment_id, qty"),
  ]);
  if (users.error) throw new HttpError(500, users.error.message);
  if (profiles.error || companies.error || eq.error) {
    throw new HttpError(500, (profiles.error || companies.error || eq.error)!.message);
  }

  const ownedBy = new Map<string, Owned>();
  for (const r of eq.data ?? []) {
    const o = ownedBy.get(r.company_id) ?? {};
    o[r.equipment_id] = r.qty;
    ownedBy.set(r.company_id, o);
  }
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
            netWorth: Number(c.cash) + assetValue(ownedBy.get(c.id) ?? {}),
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
