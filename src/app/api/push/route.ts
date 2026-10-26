import { isMissingTable } from "@/lib/server/company";
import { pushEnabled, sendToUser } from "@/lib/server/push";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Bildirimler sunucuda açık mı (anahtarlar ve tablolar hazır mı). */
export const GET = handle(async (req) => {
  await requireUser(req);
  if (!pushEnabled()) return { enabled: false };
  const { error } = await db().from("push_subscriptions").select("id", { head: true, count: "exact" }).limit(1);
  return { enabled: !error || !isMissingTable(error) };
});

/**
 * { subscription } → bu cihazı kaydet (ilk kayıtta deneme bildirimi gönderilir)
 * { test: true } → bütün cihazlara deneme bildirimi
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  if (!pushEnabled()) throw new HttpError(503, "Bildirimler sunucuda henüz açılmadı");
  const body = await req.json().catch(() => ({}));

  if (body.test === true) {
    const n = await sendToUser(user.id, { title: "PCTopia", body: "Bildirimler çalışıyor. Teklif sonuçlanınca ve kasa dolunca haber vereceğiz.", url: "/oyun", tag: "test" });
    if (!n) throw new HttpError(404, "Kayıtlı cihaz bulunamadı");
    return { ok: true, sent: n };
  }

  const s = body.subscription ?? {};
  const endpoint = String(s.endpoint ?? "");
  const p256dh = String(s.keys?.p256dh ?? "");
  const auth = String(s.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) throw new HttpError(400, "Geçersiz abonelik");

  const { data: existing } = await db().from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
  const { error } = await db()
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh, auth, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) }, { onConflict: "endpoint" });
  if (error) {
    if (isMissingTable(error)) throw new HttpError(503, "Bildirimler için veritabanında 014_bildirimler.sql çalıştırılmalı");
    throw new HttpError(500, error.message);
  }
  if (!existing || existing.user_id !== user.id) {
    await sendToUser(user.id, { title: "Bildirimler açıldı", body: "Teklif sonuçlanınca, kasa dolunca ve posta gelince haber vereceğiz.", url: "/oyun", tag: "test" });
  }
  return { ok: true };
});

/** Bu cihazın aboneliğini sil. */
export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? "");
  if (!endpoint) throw new HttpError(400, "Geçersiz istek");
  const { error } = await db().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (error && !isMissingTable(error)) throw new HttpError(500, error.message);
  return { ok: true };
});
