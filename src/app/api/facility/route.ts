import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { facilityView, syncFacility, upgradeFacility } from "@/lib/server/facility";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";
import { effectsView, loadEffects } from "@/lib/server/effects";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  let state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  if (await syncFacility(state.company)) state = (await loadCompany(user.id))!;
  const fx = (await loadEffects([state.company.id])).get(state.company.id);
  return { ...facilityView(state.company), effects: effectsView(fx) };
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  let state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  if (body.action !== "upgrade") throw new HttpError(400, "Bilinmeyen işlem");
  if (await syncFacility(state.company)) state = (await loadCompany(user.id))!;
  const message = await upgradeFacility(state.company);
  const fresh = (await loadCompany(user.id))!;
  const fx = (await loadEffects([fresh.company.id])).get(fresh.company.id);
  return { ...facilityView(fresh.company), effects: effectsView(fx), message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(fresh.company.id) };
});
