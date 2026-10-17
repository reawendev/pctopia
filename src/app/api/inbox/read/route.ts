import { loadCompany } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const kind = body.kind === "message" ? "message" : body.kind === "offer" ? "offer" : null;
  if (!id || !kind) throw new HttpError(400, "Geçersiz istek");

  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const now = new Date().toISOString();

  // Yalnızca kendi kutundakileri işaretleyebilirsin
  const q =
    kind === "message"
      ? db().from("messages").update({ read_at: now }).eq("id", id).eq("to_company", state.company.id).is("read_at", null)
      : db().from("company_offers").update({ read_at: now }).eq("id", id).eq("company_id", state.company.id).is("read_at", null);
  const { error } = await q;
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
});
