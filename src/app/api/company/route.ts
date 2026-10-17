import { isValidCharacter, isValidLogo, START_CASH } from "@/lib/game/config";
import { loadCompany, view } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) return { hasCompany: false, isAdmin: user.isAdmin };
  return { hasCompany: true, isAdmin: user.isAdmin, ...view(state.company, state.owned, state.holdings) };
});

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

  const { data, error } = await db()
    .from("companies")
    .insert({
      owner_id: user.id,
      name,
      founder_name: founderName,
      logo: body.logo,
      character: body.character,
      cash: START_CASH,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Bu şirket adı alınmış");
    throw new HttpError(500, error.message);
  }
  return { hasCompany: true, isAdmin: user.isAdmin, ...view(data as any, {}, {}) };
});
