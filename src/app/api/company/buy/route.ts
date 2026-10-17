import { EQUIPMENT_BY_ID } from "@/lib/game/config";
import { pendingIncome, unitCost } from "@/lib/game/economy";
import { loadCompany, view } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const equipmentId = String(body.equipmentId ?? "");
  if (!EQUIPMENT_BY_ID[equipmentId]) throw new HttpError(400, "Bilinmeyen ekipman");

  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await loadCompany(user.id);
    if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
    const { company, owned } = state;

    // Birikmiş geliri önce nakde çevir, sonra satın almayı düş.
    const now = Date.now();
    const gain = pendingIncome(owned, new Date(company.last_collected_at).getTime(), now);
    const qty = owned[equipmentId] ?? 0;
    const cost = unitCost(equipmentId, qty);
    const cashAfterIncome = Number(company.cash) + gain;
    if (cashAfterIncome < cost) throw new HttpError(400, "Yeterli nakit yok");

    const { data: ok, error } = await db().rpc("apply_purchase", {
      p_company: company.id,
      p_version: company.version,
      p_new_cash: cashAfterIncome - cost,
      p_equipment: equipmentId,
      p_new_qty: qty + 1,
    });
    if (error) throw new HttpError(500, error.message);
    if (ok) {
      const fresh = await loadCompany(user.id);
      return { spent: cost, ...view(fresh!.company, fresh!.owned, fresh!.holdings) };
    }
  }
  throw new HttpError(409, "Eşzamanlı işlem, tekrar dene");
});
