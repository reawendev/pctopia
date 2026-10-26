import { loadCompany } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Okundu işaretleme.
 * - { kind: "offer" | "message", id }: tek bir postayı işaretler
 * - { all: true }: gelen kutusundaki bütün teklif ve postaları işaretler
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const all = body.all === true;
  const id = String(body.id ?? "");
  const kind = body.kind === "message" ? "message" : body.kind === "offer" ? "offer" : null;
  if (!all && (!id || !kind)) throw new HttpError(400, "Geçersiz istek");

  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const now = new Date().toISOString();
  const companyId = state.company.id;

  // Yalnızca kendi kutundakileri işaretleyebilirsin
  if (all) {
    const [m, o] = await Promise.all([
      db().from("messages").update({ read_at: now }).eq("to_company", companyId).is("read_at", null),
      db().from("company_offers").update({ read_at: now }).eq("company_id", companyId).is("read_at", null),
    ]);
    const error = m.error ?? o.error;
    if (error) throw new HttpError(500, error.message);
    return { ok: true };
  }

  const q =
    kind === "message"
      ? db().from("messages").update({ read_at: now }).eq("id", id).eq("to_company", companyId).is("read_at", null)
      : db().from("company_offers").update({ read_at: now }).eq("id", id).eq("company_id", companyId).is("read_at", null);
  const { error } = await q;
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
});
