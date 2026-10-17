import { ROLES, salary, STAFF, type Role } from "@/lib/game/finance";
import { formatMoney, incomePerHour } from "@/lib/game/economy";
import { isMissingTable, loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { syncFinance } from "@/lib/server/finance";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function snapshot(userId: string, extra: Record<string, unknown> = {}) {
  const state = await loadCompany(userId);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const { data, error } = await db().from("employees").select("*").eq("company_id", state.company.id);
  if (error) {
    if (isMissingTable(error)) return { ready: false, ...extra };
    throw new HttpError(500, error.message);
  }
  const inc = incomePerHour(state.owned);
  return {
    ready: true,
    roles: ROLES.map((r) => {
      const row = (data ?? []).find((e) => e.role === r);
      return { role: r, ...STAFF[r], salary: salary(r, inc), hired: !!row, hiredAt: row?.hired_at ?? null };
    }),
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return snapshot(user.id);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const role = String(body.role ?? "") as Role;
  if (!ROLES.includes(role)) throw new HttpError(400, "Pozisyon geçersiz");
  // Önce birikmiş maaşları kapat (işten çıkarmada hak ettiği ödenir)
  await syncFinance(user.id);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const s = salary(role, incomePerHour(state.owned));
  let message = "";

  if (body.action === "hire") {
    if (Number(state.company.cash) < s * 4) throw new HttpError(400, `İşe almak için kasada en az 4 saatlik maaş (${s * 4}$) olmalı`);
    const { error } = await db().from("employees").insert({ company_id: state.company.id, role });
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "Bu pozisyonda zaten biri çalışıyor");
      if (isMissingTable(error)) throw new HttpError(503, "Çalışanlar için veritabanında 007_finans.sql çalıştırılmalı");
      throw new HttpError(500, error.message);
    }
    // Yeni çalışanın maaş saati şimdi başlar; diğerlerinin ödeme zamanı da hizalanır
    await db().from("employees").update({ paid_until: new Date().toISOString() }).eq("company_id", state.company.id);
    await logEvent(state.company.id, "staff", `${STAFF[role].name} işe alındı. Saatlik maaş ${formatMoney(s)}.`);
    message = `${STAFF[role].name} işe başladı.`;
  } else if (body.action === "fire") {
    const { error } = await db().from("employees").delete().eq("company_id", state.company.id).eq("role", role);
    if (error) throw new HttpError(500, error.message);
    await logEvent(state.company.id, "staff", `${STAFF[role].name} ile yollar ayrıldı.`);
    message = `${STAFF[role].name} işten ayrıldı.`;
  } else throw new HttpError(400, "Bilinmeyen işlem");

  const fresh = (await loadCompany(user.id))!;
  return snapshot(user.id, { message, journal: await loadJournal(fresh.company.id), state: view(fresh.company, fresh.owned, fresh.holdings) });
});
