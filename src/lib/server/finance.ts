// Finans — sunucu tarafı: tahsilat, maaşlar, banka vadesi, anlaşmaların mutabakatı, gelir ortaklığı ödemeleri.

import { BAN_HOURS, DEPOSIT_DAILY_RATE, loanOwed, salary, type LoanTerms, type RevshareTerms, type Role } from "../game/finance";
import { formatMoney, incomePerHour, pendingIncome } from "../game/economy";
import { OFFLINE_CAP_HOURS } from "../game/config";
import { isMissingTable, loadCompany, logEvent, type CompanyRow } from "./company";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";

export type DealRow = {
  id: string;
  kind: "wholesale" | "loan" | "revshare";
  from_company: string;
  to_company: string;
  terms: any;
  note: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  ends_at: string | null;
  settled_at: string | null;
  result: string | null;
};

async function companyName(id: string): Promise<string> {
  const { data } = await db().from("companies").select("name").eq("id", id).maybeSingle();
  return (data?.name as string) ?? "Bir şirket";
}

/**
 * Gelir ortaklığı: şirketin elde ettiği gelirden (tahsilat, PC satışı) ortaklara payını aktarır.
 * Toplam ödenen tutarı döndürür. Tablo yoksa 0.
 */
export async function payShares(companyId: string, amount: number, source: string): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await db().from("deals").select("*").eq("to_company", companyId).eq("kind", "revshare").eq("status", "active");
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new HttpError(500, error.message);
  }
  const now = Date.now();
  let total = 0;
  for (const d of (data ?? []) as DealRow[]) {
    if (d.ends_at && new Date(d.ends_at).getTime() <= now) continue;
    const t = d.terms as RevshareTerms;
    const share = Math.floor((amount * t.sharePct) / 100);
    if (share <= 0) continue;
    const { data: moved, error: e2 } = await db().rpc("transfer_cash", { p_from: companyId, p_to: d.from_company, p_amount: share, p_partial: true });
    if (e2) throw new HttpError(500, e2.message);
    const m = Number(moved ?? 0);
    if (m > 0) {
      total += m;
      await logEvent(d.from_company, "deal", `Gelir ortaklığından pay geldi (${source}): +${formatMoney(m)}.`, m);
    }
  }
  if (total > 0) await logEvent(companyId, "deal", `Ortaklara gelir payı ödendi (${source}): ${formatMoney(total)}.`, -total);
  return total;
}

/** Biriken geliri kasaya geçirir (sürüm kilidiyle). Toplanan tutarı döndürür. */
export async function collectIncome(userId: string, auto = false): Promise<{ collected: number; row: CompanyRow; state: NonNullable<Awaited<ReturnType<typeof loadCompany>>> }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await loadCompany(userId);
    if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
    const { company, owned } = state;
    const now = Date.now();
    const gain = pendingIncome(owned, new Date(company.last_collected_at).getTime(), now, company._cap ?? OFFLINE_CAP_HOURS);
    const { data, error } = await db()
      .from("companies")
      .update({ cash: Number(company.cash) + gain, last_collected_at: new Date(now).toISOString(), version: company.version + 1 })
      .eq("id", company.id)
      .eq("version", company.version)
      .select("*")
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (data) {
      if (gain > 0) {
        await logEvent(company.id, "collect", `${auto ? "Muhasebeci" : "Muhasebe"} ${formatMoney(gain)} tahsilat yaptı.`, gain);
        await payShares(company.id, gain, "tahsilat");
      }
      const fresh = (await loadCompany(userId))!;
      return { collected: gain, row: fresh.company, state: fresh };
    }
  }
  throw new HttpError(409, "Eşzamanlı işlem, tekrar dene");
}

/**
 * Sayfa açıkken düzenli çağrılır (şirket ve posta istekleri):
 *  - maaşlar, muhasebecinin otomatik tahsilatı
 *  - banka kredisinin vadesi (ödenemezse temerrüt)
 *  - borç anlaşmalarının vadesi, gelir ortaklıklarının bitişi, bekleyen tekliflerin süresi
 * Kasa değiştiyse true döner.
 */
export async function syncFinance(userId: string): Promise<boolean> {
  const state = await loadCompany(userId);
  if (!state) return false;
  const { company, owned } = state;
  const now = Date.now();
  let changed = false;

  // ---- Maaşlar ----
  const { data: staff, error: sErr } = await db().from("employees").select("*").eq("company_id", company.id);
  if (sErr && !isMissingTable(sErr)) throw new HttpError(500, sErr.message);
  if (!sErr && staff && staff.length > 0) {
    const paidUntil = Math.min(...staff.map((s) => new Date(s.paid_until).getTime()));
    if (now - paidUntil >= 5 * 60_000) {
      const hours = Math.min(24, (now - paidUntil) / 3_600_000);
      const inc = incomePerHour(owned);
      const amount = Math.round(staff.reduce((s, e) => s + salary(e.role as Role, inc), 0) * hours);
      const { data: ok, error } = await db().rpc("pay_payroll", { p_company: company.id, p_amount: amount, p_until: new Date(now).toISOString() });
      if (error) throw new HttpError(500, error.message);
      changed = true;
      if (ok) await logEvent(company.id, "staff", `Maaşlar ödendi: ${formatMoney(amount)}.`, -amount);
      else await logEvent(company.id, "staff", "Maaşlar ödenemedi; çalışanların hepsi istifa etti.");
    }
    // Muhasebeci: 10 dakikada bir otomatik tahsilat
    if (staff.some((s) => s.role === "muhasebeci") && now - new Date(company.last_collected_at).getTime() >= 10 * 60_000) {
      const { collected } = await collectIncome(userId, true);
      if (collected > 0) changed = true;
    }
  }

  // ---- Banka kredisi vadesi ----
  const { data: bank, error: bErr } = await db().from("bank_accounts").select("*").eq("company_id", company.id).maybeSingle();
  if (bErr && !isMissingTable(bErr)) throw new HttpError(500, bErr.message);
  if (bank && Number(bank.loan_principal) > 0 && bank.loan_due_at && new Date(bank.loan_due_at).getTime() <= now) {
    // Tek kilitli işlem: önce kasa, sonra mevduat; kalan borç silinmez (013_banka_kilit.sql)
    const { data: r, error } = await db().rpc("bank_op", {
      p_company: company.id,
      p_action: "mature",
      p_amount: 0,
      p_days: 0,
      p_loan_rate: 0,
      p_deposit_rate: DEPOSIT_DAILY_RATE,
      p_limit: 0,
      p_ban_hours: BAN_HOURS,
    });
    // 013 henüz çalıştırılmadıysa vadeyi bekletir (eski, açıklı yola dönmez)
    if (error && !/bank_op/.test(error.message)) throw new HttpError(500, error.message);
    if (!error && r) {
      changed = true;
      const owed = Number(r.owed), paid = Number(r.paid), fromDep = Number(r.fromDeposit), rest = Number(r.rest);
      if (rest > 0) {
        await logEvent(
          company.id,
          "bank",
          `Kredinin vadesi doldu: ${formatMoney(owed)} borcun ${formatMoney(paid + fromDep)} kadarı kasadan${fromDep > 0 ? " ve mevduattan" : ""} tahsil edildi. Kalan ${formatMoney(rest)} borç yarın yeniden istenecek; banka ${BAN_HOURS} saat kredi vermeyecek.`,
          -paid
        );
        await db().rpc("adjust_reputation", { p_company: company.id, p_delta: -10 });
        await postAbout(company.id, "bank_default", { company: company.name });
      } else {
        await logEvent(company.id, "bank", `Kredi vadesinde otomatik ödendi: ${formatMoney(owed)}${fromDep > 0 ? ` (${formatMoney(fromDep)} mevduattan)` : ""}.`, -paid);
      }
    }
  }

  // ---- Anlaşmalar (iki tarafı da ilgilendiren) ----
  const { data: deals, error: dErr } = await db().from("deals").select("*").or(`from_company.eq.${company.id},to_company.eq.${company.id}`).in("status", ["pending", "active"]);
  if (dErr && !isMissingTable(dErr)) throw new HttpError(500, dErr.message);
  for (const d of (deals ?? []) as DealRow[]) {
    if (d.status === "pending" && new Date(d.expires_at).getTime() <= now) {
      await db().from("deals").update({ status: "expired" }).eq("id", d.id).eq("status", "pending");
      continue;
    }
    if (d.status !== "active" || !d.ends_at || new Date(d.ends_at).getTime() > now) continue;
    if (d.kind === "loan") {
      const t = d.terms as LoanTerms;
      const owed = Math.ceil(t.amount * (1 + t.interestPct / 100));
      const { data: moved, error } = await db().rpc("deal_settle_loan", { p_deal: d.id, p_borrower: d.to_company, p_lender: d.from_company, p_owed: owed });
      if (error) throw new HttpError(500, error.message);
      const m = Number(moved);
      if (m < 0) continue; // başka istek kapattı
      changed = true;
      const [lender, borrower] = await Promise.all([companyName(d.from_company), companyName(d.to_company)]);
      if (m >= owed) {
        await logEvent(d.to_company, "deal", `${lender} şirketine borç vadesinde ödendi: ${formatMoney(owed)}.`, -owed);
        await logEvent(d.from_company, "deal", `${borrower} borcunu vadesinde ödedi: +${formatMoney(owed)}.`, owed);
      } else {
        await logEvent(d.to_company, "deal", `${lender} şirketine olan ${formatMoney(owed)} borcun yalnızca ${formatMoney(m)} kadarı ödenebildi.`, -m);
        await logEvent(d.from_company, "deal", `${borrower} borcunu ödeyemedi: ${formatMoney(owed)} yerine ${formatMoney(m)} geldi.`, m);
        await db().rpc("adjust_reputation", { p_company: d.to_company, p_delta: -10 });
        await postAbout(d.to_company, "deal_default", { company: borrower, lender });
      }
    } else if (d.kind === "revshare") {
      await db().from("deals").update({ status: "completed", settled_at: new Date(now).toISOString(), result: "Süre doldu" }).eq("id", d.id).eq("status", "active");
    }
  }

  return changed;
}
