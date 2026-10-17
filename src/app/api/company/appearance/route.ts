import { isMissingTable, loadCompany, view } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Kurulmuş bir şirketin portresini ya da logosunu değiştirir.
 * Görsel, kullanıcının kendi ürettiği ya da yüklediği bir kayıt olmalı (asset_generations).
 * { kind, assetId } ya da sade çizime dönmek için { kind, reset: true }.
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "logo" ? "logo" : body.kind === "portrait" ? "portrait" : null;
  if (!kind) throw new HttpError(400, "Tür geçersiz");
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");

  let url: string | null = null;
  if (!body.reset) {
    const { data, error } = await db().from("asset_generations").select("url").eq("id", String(body.assetId ?? "")).eq("user_id", user.id).eq("kind", kind).maybeSingle();
    if (error) {
      if (isMissingTable(error)) throw new HttpError(503, "Görseller için veritabanında 003_gorseller_gunluk.sql çalıştırılmalı");
      throw new HttpError(500, error.message);
    }
    if (!data) throw new HttpError(404, "Görsel bulunamadı");
    url = data.url;
  }
  const { error } = await db().from("companies").update(kind === "portrait" ? { portrait_url: url } : { logo_url: url }).eq("id", state.company.id);
  if (error) throw new HttpError(500, error.message);
  const fresh = (await loadCompany(user.id))!;
  return { message: body.reset ? "Sade çizime dönüldü." : kind === "portrait" ? "Portre güncellendi." : "Logo güncellendi.", state: view(fresh.company, fresh.owned, fresh.holdings) };
});
