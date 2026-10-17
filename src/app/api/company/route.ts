import { isValidCharacter, isValidLogo, START_CASH } from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import { isMissingTable, loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { gameContext } from "@/lib/server/context";
import { syncSales } from "@/lib/server/workshop";
import { syncFinance } from "@/lib/server/finance";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  let state = await loadCompany(user.id);
  if (!state) return { hasCompany: false, isAdmin: user.isAdmin };
  // Bekleyen PC satışları, maaşlar, otomatik tahsilat, vadeler
  const g = await gameContext(user.id);
  const sold = await syncSales(g.ctx);
  const fin = await syncFinance(user.id);
  if (sold || fin) state = (await loadCompany(user.id))!;
  const journal = await loadJournal(state.company.id);
  return { hasCompany: true, isAdmin: user.isAdmin, journal, ...view(state.company, state.owned, state.holdings) };
});

/** Kullanıcının kendi ürettiği görselin adresini döndürür; başkasınınkini kabul etmez. */
async function ownedAsset(userId: string, id: unknown, kind: "portrait" | "logo"): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await db()
    .from("asset_generations")
    .select("url")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(400, "Seçilen görsel bulunamadı");
  return data.url;
}

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  const founderName = String(body.founderName ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 28) throw new HttpError(400, "Şirket adı 3-28 karakter olmalı");
  if (founderName.length < 2 || founderName.length > 24) throw new HttpError(400, "Kurucu adı 2-24 karakter olmalı");
  if (!isValidLogo(body.logo)) throw new HttpError(400, "Logo seçimi geçersiz");
  if (!isValidCharacter(body.character)) throw new HttpError(400, "Karakter seçimi geçersiz");

  if (await loadCompany(user.id)) throw new HttpError(409, "Zaten bir şirketin var");

  const [portraitUrl, logoUrl] = await Promise.all([
    ownedAsset(user.id, body.portraitId, "portrait"),
    ownedAsset(user.id, body.logoId, "logo"),
  ]);

  const row: Record<string, unknown> = {
    owner_id: user.id,
    name,
    founder_name: founderName,
    logo: body.logo,
    character: body.character,
    cash: START_CASH,
  };
  // Sütunlar 003 göçüyle gelir; görsel seçilmediyse hiç göndermeyiz (göç öncesi de çalışsın)
  if (portraitUrl) row.portrait_url = portraitUrl;
  if (logoUrl) row.logo_url = logoUrl;

  const { data, error } = await db().from("companies").insert(row).select("*").single();

  if (error) {
    if (error.code === "23505") {
      throw new HttpError(409, /owner_id/.test(error.message) ? "Zaten bir şirketin var" : "Bu şirket adı alınmış");
    }
    throw new HttpError(500, error.message);
  }

  await logEvent(data.id, "founded", `${founderName}, ${name} şirketini ${formatMoney(START_CASH)} sermayeyle kurdu.`, START_CASH);
  const journal = await loadJournal(data.id);
  return { hasCompany: true, isAdmin: user.isAdmin, journal, ...view(data as any, {}, {}) };
});
