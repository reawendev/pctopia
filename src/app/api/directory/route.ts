import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Posta alıcısı seçmek için şirket rehberi (kendi şirketin hariç). */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const { data, error } = await db().from("companies").select("*").order("name").limit(500);
  if (error) throw new HttpError(500, error.message);
  return {
    companies: (data ?? [])
      .filter((c) => c.owner_id !== user.id)
      .map((c) => ({ id: c.id, name: c.name, founderName: c.founder_name, logo: c.logo, logoUrl: c.logo_url ?? null })),
  };
});
