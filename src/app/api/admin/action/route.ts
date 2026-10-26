import { db, forgetProfile, handle, HttpError, requireAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_GRANT = 1_000_000_000_000;

export const POST = handle(async (req) => {
  const admin = await requireAdmin(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const userId = String(body.userId ?? "");
  if (!userId) throw new HttpError(400, "userId gerekli");
  if (userId === admin.id && action !== "grant" && action !== "removeImages") {
    throw new HttpError(400, "Kendi hesabına bu işlemi uygulayamazsın");
  }

  switch (action) {
    case "grant": {
      const amount = Math.trunc(Number(body.amount));
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_GRANT) {
        throw new HttpError(400, "Geçersiz tutar");
      }
      const { data: c } = await db().from("companies").select("id, cash, version").eq("owner_id", userId).maybeSingle();
      if (!c) throw new HttpError(404, "Oyuncunun şirketi yok");
      const next = Math.max(0, Number(c.cash) + amount);
      const { error } = await db()
        .from("companies")
        .update({ cash: next, version: c.version + 1 })
        .eq("id", c.id)
        .eq("version", c.version);
      if (error) throw new HttpError(500, error.message);
      return { ok: true, cash: next };
    }
    case "ban":
    case "unban": {
      const { error } = await db().from("profiles").update({ banned: action === "ban" }).eq("id", userId);
      if (error) throw new HttpError(500, error.message);
      forgetProfile(userId);
      return { ok: true };
    }
    case "removeImages": {
      // Uygunsuz yüklenen görseli kaldır: şirket sade çizime döner
      const { error } = await db().from("companies").update({ portrait_url: null, logo_url: null }).eq("owner_id", userId);
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }
    case "deleteCompany": {
      const { error } = await db().from("companies").delete().eq("owner_id", userId);
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }
});
