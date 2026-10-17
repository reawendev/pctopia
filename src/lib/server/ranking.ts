// Sektör sıralaması: lider tablosu, şampiyonlar ve profil sayfası aynı hesabı kullanır.

import { companyNetWorth, loadAllAssets } from "./company";
import { snapshot } from "./market";
import { db, HttpError } from "./supabase";

export type Ranked = {
  id: string;
  ownerId: string;
  rank: number;
  name: string;
  founderName: string;
  logo: unknown;
  logoUrl: string | null;
  portraitUrl: string | null;
  character: unknown;
  createdAt: string;
  reputation: number;
  netWorth: number;
};

export async function rankCompanies(): Promise<Ranked[]> {
  const [{ data: companies, error }, assets] = await Promise.all([
    // "*": sonradan eklenen sütunlar göç öncesi yoksa da hata vermesin
    db().from("companies").select("*"),
    loadAllAssets(),
  ]);
  if (error) throw new HttpError(500, error.message);
  const prices = snapshot().prices;
  return (companies ?? [])
    .map((c) => {
      const a = assets.get(c.id) ?? { owned: {}, holdings: {}, extra: 0 };
      return {
        id: c.id,
        ownerId: c.owner_id,
        rank: 0,
        name: c.name,
        founderName: c.founder_name,
        logo: c.logo,
        logoUrl: (c.logo_url as string | null) ?? null,
        portraitUrl: (c.portrait_url as string | null) ?? null,
        character: c.character,
        createdAt: c.created_at,
        reputation: (c.reputation as number | undefined) ?? 50,
        netWorth: companyNetWorth(c.cash, a.owned, a.holdings, prices, (a as any).extra ?? 0),
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
