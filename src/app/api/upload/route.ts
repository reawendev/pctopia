import { randomUUID } from "node:crypto";
import { isMissingTable } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_BYTES = 1_000_000; // 1 MB
const UPLOADS_PER_DAY = 10;
const UPLOAD_MARK = "[yükleme]"; // asset_generations.prompt: PixelLab hakkından düşülmez

/** Dosyanın gerçek türünü ilk baytlarından anlar (uzantıya güvenmez). */
function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}

/** Portre ya da logo yükler; asset_generations'a kaydeder ve kimliğini döndürür. */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Dosya gönderilmedi");
  const kind = form.get("kind") === "logo" ? "logo" : form.get("kind") === "portrait" ? "portrait" : null;
  if (!kind) throw new HttpError(400, "Tür geçersiz");
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Dosya gönderilmedi");
  if (file.size > MAX_BYTES) throw new HttpError(400, "Dosya en fazla 1 MB olabilir");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw new HttpError(400, "Yalnızca PNG, JPEG ya da WebP yükleyebilirsin");

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: cErr } = await db()
    .from("asset_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("prompt", UPLOAD_MARK)
    .gte("created_at", since);
  if (cErr) {
    if (isMissingTable(cErr)) throw new HttpError(503, "Yükleme için veritabanında 003_gorseller_gunluk.sql çalıştırılmalı");
    throw new HttpError(500, cErr.message);
  }
  if (!user.isAdmin && (count ?? 0) >= UPLOADS_PER_DAY) throw new HttpError(429, `Günde en fazla ${UPLOADS_PER_DAY} görsel yükleyebilirsin`);

  const path = `${user.id}/upload-${kind}-${randomUUID()}.${type.ext}`;
  const up = await db().storage.from("generated").upload(path, Buffer.from(bytes), { contentType: type.mime, upsert: false });
  if (up.error) throw new HttpError(500, "Görsel kaydedilemedi: " + up.error.message);
  const url = db().storage.from("generated").getPublicUrl(path).data.publicUrl;

  const { data, error } = await db()
    .from("asset_generations")
    .insert({ user_id: user.id, kind, path, url, prompt: UPLOAD_MARK, cost_usd: 0 })
    .select("id")
    .single();
  if (error) throw new HttpError(500, error.message);
  return { id: data.id, kind, url };
});
