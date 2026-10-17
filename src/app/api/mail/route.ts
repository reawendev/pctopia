import { isMissingTable, loadCompany } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const HOURLY_LIMIT = 20;

/** Şirketler arası e-posta gönderir. */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const to = String(body.toCompanyId ?? "");
  const subject = String(body.subject ?? "").trim().replace(/\s+/g, " ");
  const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim();

  if (!to) throw new HttpError(400, "Alıcı seçmelisin");
  if (subject.length < 1 || subject.length > 120) throw new HttpError(400, "Konu 1-120 karakter olmalı");
  if (text.length < 1 || text.length > 2000) throw new HttpError(400, "Mesaj 1-2000 karakter olmalı");

  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  if (to === state.company.id) throw new HttpError(400, "Kendi şirketine posta gönderemezsin");

  const { data: target, error: tErr } = await db().from("companies").select("id, name").eq("id", to).maybeSingle();
  if (tErr) throw new HttpError(500, tErr.message);
  if (!target) throw new HttpError(404, "Alıcı şirket bulunamadı");

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: cErr } = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("from_company", state.company.id)
    .gte("created_at", since);
  if (cErr) {
    if (isMissingTable(cErr)) throw new HttpError(503, "Posta için veritabanında 004_teklifler_posta.sql çalıştırılmalı");
    throw new HttpError(500, cErr.message);
  }
  if ((count ?? 0) >= HOURLY_LIMIT) throw new HttpError(429, `Saatte en fazla ${HOURLY_LIMIT} posta gönderebilirsin`);

  const { data, error } = await db()
    .from("messages")
    .insert({ from_company: state.company.id, to_company: to, subject, body: text })
    .select("id, created_at")
    .single();
  if (error) throw new HttpError(500, error.message);
  return { ok: true, id: data.id, to: target.name };
});
