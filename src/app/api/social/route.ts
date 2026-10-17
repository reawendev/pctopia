import { isMissingTable, loadCompany } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Ortak sosyal medya akışı. ?scope=me yalnızca kendi şirketin hakkındakiler. */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const scope = new URL(req.url).searchParams.get("scope") === "me" ? "me" : "all";
  const state = await loadCompany(user.id);

  let q = db().from("social_posts").select("*").order("created_at", { ascending: false }).limit(50);
  if (scope === "me") {
    if (!state) return { ready: true, posts: [] };
    q = q.eq("company_id", state.company.id);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return { ready: false, posts: [] };
    throw new HttpError(500, error.message);
  }

  const ids = Array.from(new Set((data ?? []).map((p) => p.company_id).filter(Boolean)));
  const cos = new Map<string, { name: string; logo: unknown; logoUrl: string | null }>();
  if (ids.length) {
    const { data: rows } = await db().from("companies").select("*").in("id", ids);
    for (const c of rows ?? []) cos.set(c.id, { name: c.name, logo: c.logo, logoUrl: c.logo_url ?? null });
  }

  return {
    ready: true,
    posts: (data ?? []).map((p) => ({
      id: p.id,
      author: p.author,
      handle: p.handle,
      text: p.text,
      repDelta: p.rep_delta,
      at: p.created_at,
      company: p.company_id ? { id: p.company_id, ...(cos.get(p.company_id) ?? { name: "Kapanmış şirket", logo: null, logoUrl: null }) } : null,
      mine: !!state && p.company_id === state.company.id,
    })),
  };
});
