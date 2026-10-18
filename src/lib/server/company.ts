import { db, HttpError } from "./supabase";
import { snapshot } from "./market";
import { assetValue, incomePerHour, pendingIncome, type Owned } from "../game/economy";
import { portfolioValue, type Holdings } from "../game/market";
import { ACCOUNTANT_CAP_HOURS, depositValue, loanOwed, RESALE, type Role } from "../game/finance";
import { OFFLINE_CAP_HOURS } from "../game/config";
import { FACILITY_RESALE, facilityInvested } from "../game/facility";

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
  /** loadCompany tarafından eklenir: banka + mülk değeri (net değere eklenir) */
  _extra?: number;
  /** loadCompany tarafından eklenir: gelir birikme sınırı (saat) */
  _cap?: number;
  /** loadCompany tarafından eklenir: işe alınmış çalışanlar */
  _staff?: Role[];
  facility_level?: number;
  facility_target?: number | null;
  facility_ready_at?: string | null;
  shares_total?: number;
  founder_shares?: number;
  ipo_at?: string | null;
};

/** Tesise yapılan yatırımın net değere katkısı (inşaatı süren seviye dahil: bedeli ödendi). */
export function facilityWorth(c: { facility_level?: number | null; facility_target?: number | null }): number {
  const lvl = Math.max(c.facility_level ?? 1, c.facility_target ?? 0);
  return Math.floor(facilityInvested(lvl) * FACILITY_RESALE);
}

type BankRow = { company_id: string; deposit: number; deposit_at: string; loan_principal: number; loan_rate: number; loan_taken_at: string | null; loan_due_at: string | null; banned_until: string | null };

/** Banka (mevduat − borç) ve statü eşyalarının (%70) net değere katkısı. */
export function extraWorth(bank: BankRow | null | undefined, statusPrices: number[], now = Date.now()): number {
  let v = statusPrices.reduce((s, p) => s + Math.floor(Number(p) * RESALE), 0);
  if (bank) {
    v += depositValue(Number(bank.deposit), new Date(bank.deposit_at).getTime(), now);
    if (Number(bank.loan_principal) > 0 && bank.loan_taken_at && bank.loan_due_at) {
      v -= loanOwed(Number(bank.loan_principal), bank.loan_rate, new Date(bank.loan_taken_at).getTime(), new Date(bank.loan_due_at).getTime(), now);
    }
  }
  return v;
}

/** 007 göçü yoksa boş döner. */
async function optional<T>(q: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  return data ?? [];
}

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

  const [bank, status, staff] = await Promise.all([
    optional<BankRow>(db().from("bank_accounts").select("*").eq("company_id", company.id)),
    optional<{ price: number }>(db().from("status_items").select("price").eq("company_id", company.id)),
    optional<{ role: Role }>(db().from("employees").select("role").eq("company_id", company.id)),
  ]);
  const row = company as CompanyRow;
  row._extra = extraWorth(bank[0], status.map((s) => s.price)) + facilityWorth(row);
  // Elindeki oyuncu şirket hisseleri (011)
  const ph = await optional<{ shares: number }>(db().from("player_holdings").select("shares").eq("holder", row.id));
  if (ph.length) {
    const { holdingsValueOf } = await import("./equity");
    row._extra += await holdingsValueOf(row.id);
  }
  row._staff = staff.map((s) => s.role);
  row._cap = row._staff.includes("muhasebeci") ? ACCOUNTANT_CAP_HOURS : OFFLINE_CAP_HOURS;
  return { company: row, owned, holdings };
}

/** Lider tablosu ve yönetici paneli için tüm şirketlerin ekipman + portföy değeri. */
export async function loadAllAssets(): Promise<Map<string, { owned: Owned; holdings: Holdings; extra: number }>> {
  const [eq, hold, banks, status] = await Promise.all([
    db().from("company_equipment").select("company_id, equipment_id, qty"),
    db().from("company_holdings").select("company_id, stock_id, shares, cost_basis"),
    optional<BankRow>(db().from("bank_accounts").select("*")),
    optional<{ company_id: string; price: number }>(db().from("status_items").select("company_id, price")),
  ]);
  if (eq.error) throw new HttpError(500, eq.error.message);
  if (hold.error && !isMissingTable(hold.error)) throw new HttpError(500, hold.error.message);

  const map = new Map<string, { owned: Owned; holdings: Holdings; extra: number }>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) map.set(id, (v = { owned: {}, holdings: {}, extra: 0 }));
    return v;
  };
  const statusBy = new Map<string, number[]>();
  for (const s of status) statusBy.set(s.company_id, [...(statusBy.get(s.company_id) ?? []), s.price]);
  const ids = new Set([...banks.map((b) => b.company_id), ...statusBy.keys()]);
  for (const id of ids) get(id).extra = extraWorth(banks.find((b) => b.company_id === id), statusBy.get(id) ?? []);
  for (const r of eq.data ?? []) get(r.company_id).owned[r.equipment_id] = r.qty;
  for (const r of hold.data ?? []) {
    get(r.company_id).holdings[r.stock_id] = { shares: Number(r.shares), costBasis: Number(r.cost_basis) };
  }
  return map;
}

/** Nakit + ekipman değeri + portföyün güncel piyasa değeri. */
export function companyNetWorth(cash: number, owned: Owned, holdings: Holdings, prices = snapshot().prices, extra = 0): number {
  return Number(cash) + assetValue(owned) + portfolioValue(holdings, prices) + extra;
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
    pending: pendingIncome(owned, last, now, company._cap ?? OFFLINE_CAP_HOURS),
    capHours: company._cap ?? OFFLINE_CAP_HOURS,
    staff: company._staff ?? [],
    extraWorth: company._extra ?? 0,
    portfolioValue: portfolioValue(holdings, prices),
    netWorth: companyNetWorth(company.cash, owned, holdings, prices, company._extra ?? 0),
    ownership: Number(company.founder_shares ?? 1000) / Number(company.shares_total ?? 1000),
    ipo: company.ipo_at ?? null,
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
