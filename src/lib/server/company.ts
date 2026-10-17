import { db, HttpError } from "./supabase";
import { assetValue, incomePerHour, pendingIncome, type Owned } from "../game/economy";

export type CompanyRow = {
  id: string;
  owner_id: string;
  name: string;
  founder_name: string;
  logo: any;
  character: any;
  cash: number;
  last_collected_at: string;
  version: number;
};

export async function loadCompany(userId: string): Promise<{ company: CompanyRow; owned: Owned } | null> {
  const { data: company, error } = await db()
    .from("companies")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!company) return null;

  const { data: rows, error: e2 } = await db()
    .from("company_equipment")
    .select("equipment_id, qty")
    .eq("company_id", company.id);
  if (e2) throw new HttpError(500, e2.message);

  const owned: Owned = {};
  for (const r of rows ?? []) owned[r.equipment_id] = r.qty;
  return { company: company as CompanyRow, owned };
}

/** İstemciye giden oyun durumu. */
export function view(company: CompanyRow, owned: Owned) {
  const now = Date.now();
  const last = new Date(company.last_collected_at).getTime();
  return {
    company: {
      id: company.id,
      name: company.name,
      founderName: company.founder_name,
      logo: company.logo,
      character: company.character,
      cash: Number(company.cash),
      lastCollectedAt: company.last_collected_at,
    },
    owned,
    incomePerHour: incomePerHour(owned),
    pending: pendingIncome(owned, last, now),
    netWorth: Number(company.cash) + assetValue(owned),
    serverTime: now,
  };
}
