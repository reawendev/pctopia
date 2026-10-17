import { db, HttpError } from "./supabase";
import { snapshot } from "./market";
import { assetValue, incomePerHour, pendingIncome, type Owned } from "../game/economy";
import { portfolioValue, type Holdings } from "../game/market";

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
  created_at?: string;
  portrait_url?: string | null;
  logo_url?: string | null;
  reputation?: number;
  last_meet_at?: string | null;
};

/** Göç (002_borsa.sql) henüz çalıştırılmadıysa tablo yoktur; oyunu kırmadan boş kabul ederiz. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

export async function loadCompany(
  userId: string
): Promise<{ company: CompanyRow; owned: Owned; holdings: Holdings } | null> {
  const { data: company, error } = await db().from("companies").select("*").eq("owner_id", userId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!company) return null;

  const [eq, hold] = await Promise.all([
    db().from("company_equipment").select("equipment_id, qty").eq("company_id", company.id),
    db().from("company_holdings").select("stock_id, shares, cost_basis").eq("company_id", company.id),
  ]);
  if (eq.error) throw new HttpError(500, eq.error.message);
  if (hold.error && !isMissingTable(hold.error)) throw new HttpError(500, hold.error.message);

  const owned: Owned = {};
  for (const r of eq.data ?? []) owned[r.equipment_id] = r.qty;
  const holdings: Holdings = {};
  for (const r of hold.data ?? []) holdings[r.stock_id] = { shares: Number(r.shares), costBasis: Number(r.cost_basis) };
  return { company: company as CompanyRow, owned, holdings };
}

/** Lider tablosu ve yönetici paneli için tüm şirketlerin ekipman + portföy değeri. */
export async function loadAllAssets(): Promise<Map<string, { owned: Owned; holdings: Holdings }>> {
  const [eq, hold] = await Promise.all([
    db().from("company_equipment").select("company_id, equipment_id, qty"),
    db().from("company_holdings").select("company_id, stock_id, shares, cost_basis"),
  ]);
  if (eq.error) throw new HttpError(500, eq.error.message);
  if (hold.error && !isMissingTable(hold.error)) throw new HttpError(500, hold.error.message);

  const map = new Map<string, { owned: Owned; holdings: Holdings }>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) map.set(id, (v = { owned: {}, holdings: {} }));
    return v;
  };
  for (const r of eq.data ?? []) get(r.company_id).owned[r.equipment_id] = r.qty;
  for (const r of hold.data ?? []) {
    get(r.company_id).holdings[r.stock_id] = { shares: Number(r.shares), costBasis: Number(r.cost_basis) };
  }
  return map;
}

/** Nakit + ekipman değeri + portföyün güncel piyasa değeri. */
export function companyNetWorth(cash: number, owned: Owned, holdings: Holdings, prices = snapshot().prices): number {
  return Number(cash) + assetValue(owned) + portfolioValue(holdings, prices);
}

/** İstemciye giden oyun durumu. */
export function view(company: CompanyRow, owned: Owned, holdings: Holdings) {
  const now = Date.now();
  const last = new Date(company.last_collected_at).getTime();
  const prices = snapshot(now).prices;
  return {
    company: {
      id: company.id,
      name: company.name,
      founderName: company.founder_name,
      logo: company.logo,
      character: company.character,
      cash: Number(company.cash),
      lastCollectedAt: company.last_collected_at,
      createdAt: company.created_at ?? null,
      portraitUrl: company.portrait_url ?? null,
      logoUrl: company.logo_url ?? null,
      reputation: company.reputation ?? 50,
    },
    owned,
    holdings,
    incomePerHour: incomePerHour(owned),
    pending: pendingIncome(owned, last, now),
    portfolioValue: portfolioValue(holdings, prices),
    netWorth: companyNetWorth(company.cash, owned, holdings, prices),
    serverTime: now,
  };
}

// ---- Şirket günlüğü ----

export type JournalEntry = { id: number; kind: string; text: string; amount: number | null; at: string };

/** Günlüğe kayıt düşer. Başarısız olursa oyunu durdurmaz. */
export async function logEvent(companyId: string, kind: string, text: string, amount?: number): Promise<void> {
  const { error } = await db().from("company_events").insert({ company_id: companyId, kind, text, amount: amount ?? null });
  if (error && !isMissingTable(error)) console.error("logEvent", error.message);
}

export async function loadJournal(companyId: string, limit = 20): Promise<JournalEntry[]> {
  const { data, error } = await db()
    .from("company_events")
    .select("id, kind, text, amount, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.error("loadJournal", error.message);
    return [];
  }
  return (data ?? []).map((e) => ({ id: e.id, kind: e.kind, text: e.text, amount: e.amount === null ? null : Number(e.amount), at: e.created_at }));
}
