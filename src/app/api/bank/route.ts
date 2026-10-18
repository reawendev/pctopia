import {
  BAN_HOURS, depositValue, DEPOSIT_DAILY_RATE, LOAN_DAILY_RATE, LOAN_TERMS, loanAtMaturity, loanLimit, loanOwed,
} from "@/lib/game/finance";
import { formatMoney } from "@/lib/game/economy";
import { isMissingTable, loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { gameContext } from "@/lib/server/context";
import { syncFinance } from "@/lib/server/finance";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED = "Banka için veritabanında 007_finans.sql çalıştırılmalı";

async function account(companyId: string) {
  const { data, error } = await db().from("bank_accounts").select("*").eq("company_id", companyId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return undefined;
    throw new HttpError(500, error.message);
  }
  return data;
}

async function snapshot(userId: string, extra: Record<string, unknown> = {}) {
  const g = await gameContext(userId);
  const a = await account(g.company.id);
  if (a === undefined) return { ready: false, ...extra };
  const now = Date.now();
  const hasLoan = !!a && Number(a.loan_principal) > 0;
  const owed = hasLoan ? loanOwed(Number(a.loan_principal), a.loan_rate, new Date(a.loan_taken_at).getTime(), new Date(a.loan_due_at).getTime(), now) : 0;
  const deposit = a ? depositValue(Number(a.deposit), new Date(a.deposit_at).getTime(), now) : 0;
  return {
    ready: true,
    loanRate: LOAN_DAILY_RATE,
    depositRate: DEPOSIT_DAILY_RATE,
    terms: LOAN_TERMS,
    limit: loanLimit(g.netWorth + owed),
    loan: hasLoan ? { principal: Number(a.loan_principal), owed, dueAt: a.loan_due_at, takenAt: a.loan_taken_at } : null,
    deposit,
    bannedUntil: a?.banned_until && new Date(a.banned_until).getTime() > now ? a.banned_until : null,
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  await syncFinance(user.id);
  return snapshot(user.id);
});

// Bütün para hareketi tek kilitli veritabanı fonksiyonunda (013_banka_kilit.sql): eşzamanlı istekler sırayla işlenir.
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  await syncFinance(user.id);
  const g = await gameContext(user.id);
  const a = await account(g.company.id);
  if (a === undefined) throw new HttpError(503, NEED);
  const action = String(body.action ?? "");
  if (!["borrow", "repay", "deposit", "withdraw"].includes(action)) throw new HttpError(400, "Bilinmeyen işlem");
  const amount = Math.trunc(Number(body.amount));
  const days = Math.trunc(Number(body.days));
  if (action !== "repay" && (!Number.isFinite(amount) || amount < 1)) throw new HttpError(400, "Tutar geçersiz");
  const limit = loanLimit(g.netWorth);
  if (action === "borrow" && !LOAN_TERMS.includes(days)) throw new HttpError(400, "Vade geçersiz");

  const { data: r, error } = await db().rpc("bank_op", {
    p_company: g.company.id,
    p_action: action,
    p_amount: action === "repay" ? 0 : amount,
    p_days: action === "borrow" ? days : 0,
    p_loan_rate: LOAN_DAILY_RATE,
    p_deposit_rate: DEPOSIT_DAILY_RATE,
    p_limit: limit,
    p_ban_hours: BAN_HOURS,
  });
  if (error) {
    const m = error.message;
    if (/bank_op/.test(m) && /function|exist/i.test(m)) throw new HttpError(503, "Banka güncellemesi için veritabanında 013_banka_kilit.sql çalıştırılmalı");
    if (/Açık kredi var/.test(m)) throw new HttpError(409, "Önce mevcut krediyi kapatmalısın");
    if (/Kredi yasağı/.test(m)) throw new HttpError(403, "Temerrüt nedeniyle banka şu an kredi vermiyor");
    if (/Tutar sınır dışı/.test(m)) throw new HttpError(400, `Kredi tutarı $100 ile ${formatMoney(limit)} arasında olmalı`);
    if (/Açık kredi yok/.test(m)) throw new HttpError(400, "Açık kredin yok");
    if (/Mevduat yetersiz/.test(m)) throw new HttpError(400, "Mevduatta bu kadar para yok");
    if (/Yetersiz nakit/.test(m)) throw new HttpError(400, action === "repay" ? "Kapatmak için kasada yeterli nakit yok" : "Kasada bu kadar nakit yok");
    if (/Vade/.test(m)) throw new HttpError(400, "Vade geçersiz");
    throw new HttpError(500, m);
  }

  let message = "";
  if (action === "borrow") {
    message = `${formatMoney(amount)} kredi kullanıldı. Vadede ${formatMoney(loanAtMaturity(amount, LOAN_DAILY_RATE, days))} ödenecek.`;
    await logEvent(g.company.id, "bank", `Bankadan ${days} gün vadeli ${formatMoney(amount)} kredi çekildi.`, amount);
  } else if (action === "repay") {
    message = `Kredi kapatıldı: ${formatMoney(Number(r.owed))}.`;
    await logEvent(g.company.id, "bank", `Kredi erken kapatıldı: ${formatMoney(Number(r.owed))}.`, -Number(r.owed));
  } else if (action === "deposit") {
    message = `${formatMoney(amount)} mevduata yatırıldı.`;
    await logEvent(g.company.id, "bank", `Mevduata ${formatMoney(amount)} yatırıldı.`, -amount);
  } else {
    message = `Mevduattan ${formatMoney(amount)} çekildi.`;
    await logEvent(g.company.id, "bank", `Mevduattan ${formatMoney(amount)} çekildi.`, amount);
  }
  const fresh = (await loadCompany(user.id))!;
  return snapshot(user.id, { message, journal: await loadJournal(fresh.company.id), state: view(fresh.company, fresh.owned, fresh.holdings) });
});
