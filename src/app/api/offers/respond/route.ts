import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { gameContext } from "@/lib/server/context";
import { offerView, respondOffer } from "@/lib/server/offers";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const offerId = String(body.offerId ?? "");
  const choiceId = String(body.choiceId ?? "");
  if (!offerId || !choiceId) throw new HttpError(400, "Teklif ve seçenek gerekli");

  const g = await gameContext(user.id);
  const state = g;
  const { offer } = await respondOffer(g.company.id, g.company.name, offerId, choiceId, g.perks.press);
  const fresh = await loadCompany(user.id);
  const journal = await loadJournal(state.company.id);
  return { offer: offerView(offer), journal, ...view(fresh!.company, fresh!.owned, fresh!.holdings) };
});
