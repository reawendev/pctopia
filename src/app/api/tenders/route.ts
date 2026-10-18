import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { placeBid, tenderView, withdrawBid } from "@/lib/server/tenders";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  return tenderView(state.company.id);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  const tenderId = String(body.tenderId ?? "");
  let r: { message: string };
  if (body.action === "bid") r = await placeBid(c.id, c.reputation ?? 50, tenderId, String(body.modelId ?? ""), Number(body.unitPrice));
  else if (body.action === "withdraw") r = await withdrawBid(c.id, tenderId);
  else throw new HttpError(400, "Bilinmeyen işlem");
  const fresh = (await loadCompany(user.id))!;
  return { ...(await tenderView(c.id)), message: r.message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(c.id) };
});
