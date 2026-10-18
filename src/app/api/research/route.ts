import { formatMoney } from "@/lib/game/economy";
import { effectText, TECH_BY_ID } from "@/lib/game/research";
import { loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { invalidateMarket } from "@/lib/server/workshop";
import { researchView } from "@/lib/server/research";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function names(): Promise<(id: string) => string> {
  const { data } = await db().from("companies").select("id, name");
  const m = new Map((data ?? []).map((c) => [c.id, c.name as string]));
  return (id) => m.get(id) ?? "Kapanmış şirket";
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  return researchView(state.company.id, await names());
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  if (body.action !== "start") throw new HttpError(400, "Bilinmeyen işlem");
  const t = TECH_BY_ID[String(body.techId ?? "")];
  if (!t) throw new HttpError(400, "Proje geçersiz");
  const cur = await researchView(c.id, await names());
  if (!cur.ready) throw new HttpError(503, "Ar-Ge için veritabanında 009_ihale_arge.sql çalıştırılmalı");
  const st = cur.techs.find((x) => x.id === t.id)!;
  if (st.status === "locked") throw new HttpError(400, `Önce “${TECH_BY_ID[t.requires!].name}” tamamlanmalı`);
  if (st.status !== "available") throw new HttpError(409, "Bu proje zaten başlatıldı");
  if (cur.running) throw new HttpError(409, "Aynı anda tek proje yürütülebilir");
  const { error } = await db().rpc("research_start", { p_company: c.id, p_tech: t.id, p_cost: t.cost, p_hours: t.hours });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Bu proje için kasada ${formatMoney(t.cost)} olmalı`);
    if (/Devam eden/.test(error.message)) throw new HttpError(409, "Aynı anda tek proje yürütülebilir");
    if (/duplicate|23505/i.test(error.message + (error.code ?? ""))) throw new HttpError(409, "Bu proje zaten başlatıldı");
    throw new HttpError(500, error.message);
  }
  invalidateMarket();
  await logEvent(c.id, "research", `Ar-Ge projesi başladı: “${t.name}”, ${formatMoney(t.cost)}, ${t.hours} saat.`, -t.cost);
  const fresh = (await loadCompany(user.id))!;
  return {
    ...(await researchView(c.id, await names())),
    message: `“${t.name}” başladı. ${t.hours} saat sonra: ${effectText(t.effect)}.`,
    state: view(fresh.company, fresh.owned, fresh.holdings),
    journal: await loadJournal(c.id),
  };
});
