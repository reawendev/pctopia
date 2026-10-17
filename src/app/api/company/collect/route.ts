import { loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { formatMoney, pendingIncome } from "@/lib/game/economy";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const POST = handle(async (req) => {
  const user = await requireUser(req);

  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await loadCompany(user.id);
    if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
    const { company, owned, holdings } = state;

    const now = Date.now();
    const gain = pendingIncome(owned, new Date(company.last_collected_at).getTime(), now);
    const newCash = Number(company.cash) + gain;

    const { data, error } = await db()
      .from("companies")
      .update({ cash: newCash, last_collected_at: new Date(now).toISOString(), version: company.version + 1 })
      .eq("id", company.id)
      .eq("version", company.version)
      .select("*")
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (data) {
      if (gain > 0) await logEvent(company.id, "collect", `Muhasebe ${formatMoney(gain)} tahsilat yaptı.`, gain);
      const journal = await loadJournal(company.id);
      return { collected: gain, journal, ...view(data as any, owned, holdings) };
    }
    // sürüm çakıştı, tekrar dene
  }
  throw new HttpError(409, "Eşzamanlı işlem, tekrar dene");
});
