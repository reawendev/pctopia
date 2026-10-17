import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { collectIncome } from "@/lib/server/finance";
import { handle, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { collected } = await collectIncome(user.id);
  const state = (await loadCompany(user.id))!;
  const journal = await loadJournal(state.company.id);
  return { collected, journal, ...view(state.company, state.owned, state.holdings) };
});
