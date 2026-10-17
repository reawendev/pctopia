import { rankCompanies } from "@/lib/server/ranking";
import { loadSeasons } from "@/lib/server/seasons";
import { db, handle, HttpError, requireAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CONFIRM = "SEZONU BİTİR";

/** Sezonu bitirir: ilk üçü şeref listesine yazar, oyun verisini sıfırlar, yeni sezonu açar. */
export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "") !== CONFIRM) throw new HttpError(400, `Onay için "${CONFIRM}" yazmalısın`);

  const s = await loadSeasons();
  if (!s) throw new HttpError(503, "Sezonlar için veritabanında 006_sezonlar.sql çalıştırılmalı");
  if (!s.current) throw new HttpError(409, "Açık sezon yok");

  const champions = (await rankCompanies()).slice(0, 3).map((c) => ({
    rank: c.rank,
    name: c.name,
    founderName: c.founderName,
    netWorth: c.netWorth,
    reputation: c.reputation,
    logo: c.logo,
    logoUrl: c.logoUrl,
    portraitUrl: c.portraitUrl,
    character: c.character,
  }));

  const { data, error } = await db().rpc("end_season", { p_champions: champions });
  if (error) throw new HttpError(500, error.message);
  return { ok: true, newSeason: data, champions };
});
