import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { opsView, runOp } from "@/lib/server/ops";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const target = new URL(req.url).searchParams.get("target") ?? "";
  if (target === state.company.id) throw new HttpError(400, "Kendi şirketin");
  return opsView(state.company.id, target);
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  const target = String(body.target ?? "");
  const r = await runOp({ id: c.id, name: c.name, staff: c._staff ?? [] }, target, String(body.op ?? ""));
  const fresh = (await loadCompany(user.id))!;
  return { ...(await opsView(c.id, target)), result: r, message: r.message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(c.id) };
});
