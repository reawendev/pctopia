import {
  depositValue, DEPOSIT_DAILY_RATE, LOAN_DAILY_RATE, LOAN_TERMS, loanAtMaturity, loanLimit, loanOwed,
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

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  await syncFinance(user.id);
  const g = await gameContext(user.id);
  const a = await account(g.company.id);
  if (a === undefined) throw new HttpError(503, NEED);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cur = {
    deposit: a ? Number(a.deposit) : 0,
    depositAt: a?.deposit_at ?? nowIso,
    principal: a ? Number(a.loan_principal) : 0,
    rate: a?.loan_rate ?? 0,
    takenAt: a?.loan_taken_at ?? null,
    dueAt: a?.loan_due_at ?? null,
    banned: a?.banned_until ?? null,
  };
  const amount = Math.trunc(Number(body.amount));
  let delta = 0;
  let message = "";

  switch (body.action) {
    case "borrow": {
      if (cur.principal > 0) throw new HttpError(409, "Önce mevcut krediyi kapatmalısın");
      if (cur.banned && new Date(cur.banned).getTime() > now) throw new HttpError(403, "Temerrüt nedeniyle banka şu an kredi vermiyor");
      const days = Math.trunc(Number(body.days));
      if (!LOAN_TERMS.includes(days)) throw new HttpError(400, "Vade geçersiz");
      const limit = loanLimit(g.netWorth);
      if (!Number.isFinite(amount) || amount < 100 || amount > limit) throw new HttpError(400, `Kredi tutarı $100 ile ${formatMoney(limit)} arasında olmalı`);
      Object.assign(cur, { principal: amount, rate: LOAN_DAILY_RATE, takenAt: nowIso, dueAt: new Date(now + days * 86_400_000).toISOString() });
      delta = amount;
      message = `${formatMoney(amount)} kredi kullanıldı. Vadede ${formatMoney(loanAtMaturity(amount, LOAN_DAILY_RATE, days))} ödenecek.`;
      await logEvent(g.company.id, "bank", `Bankadan ${days} gün vadeli ${formatMoney(amount)} kredi çekildi.`, amount);
      break;
    }
    case "repay": {
      if (cur.principal <= 0) throw new HttpError(400, "Açık kredin yok");
      const owed = loanOwed(cur.principal, cur.rate, new Date(cur.takenAt!).getTime(), new Date(cur.dueAt!).getTime(), now);
      if (Number(g.company.cash) < owed) throw new HttpError(400, `Kapatmak için kasada ${formatMoney(owed)} olmalı`);
      Object.assign(cur, { principal: 0, rate: 0, takenAt: null, dueAt: null });
      delta = -owed;
      message = `Kredi kapatıldı: ${formatMoney(owed)}.`;
      await logEvent(g.company.id, "bank", `Kredi erken kapatıldı: ${formatMoney(owed)}.`, -owed);
      break;
    }
    case "deposit": {
      if (!Number.isFinite(amount) || amount < 1) throw new HttpError(400, "Tutar geçersiz");
      if (Number(g.company.cash) < amount) throw new HttpError(400, "Kasada bu kadar nakit yok");
      Object.assign(cur, { deposit: depositValue(cur.deposit, new Date(cur.depositAt).getTime(), now) + amount, depositAt: nowIso });
      delta = -amount;
      message = `${formatMoney(amount)} mevduata yatırıldı.`;
      await logEvent(g.company.id, "bank", `Mevduata ${formatMoney(amount)} yatırıldı.`, -amount);
      break;
    }
    case "withdraw": {
      const value = depositValue(cur.deposit, new Date(cur.depositAt).getTime(), now);
      if (!Number.isFinite(amount) || amount < 1 || amount > value) throw new HttpError(400, `En fazla ${formatMoney(value)} çekebilirsin`);
      Object.assign(cur, { deposit: value - amount, depositAt: nowIso });
      delta = amount;
      message = `Mevduattan ${formatMoney(amount)} çekildi.`;
      await logEvent(g.company.id, "bank", `Mevduattan ${formatMoney(amount)} çekildi.`, amount);
      break;
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }

  const { error } = await db().rpc("bank_apply", {
    p_company: g.company.id,
    p_cash_delta: delta,
    p_deposit: cur.deposit,
    p_deposit_at: cur.depositAt,
    p_loan_principal: cur.principal,
    p_loan_rate: cur.rate,
    p_loan_taken_at: cur.takenAt,
    p_loan_due_at: cur.dueAt,
    p_banned_until: cur.banned,
  });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, "Kasada yeterli nakit yok");
    throw new HttpError(500, error.message);
  }
  const fresh = (await loadCompany(user.id))!;
  return snapshot(user.id, { message, journal: await loadJournal(fresh.company.id), state: view(fresh.company, fresh.owned, fresh.holdings) });
});
