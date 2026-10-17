import { isMissingTable, loadCompany } from "@/lib/server/company";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED = "Paylaşım için veritabanında 008_sosyal_profil.sql çalıştırılmalı";
const POSTS_PER_HOUR = 10;
const COMMENTS_PER_HOUR = 30;

/** Şirket adından kullanıcı adı: "Nova Bilişim" → "novabilisim" */
function slug(name: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return (
    name
      .toLocaleLowerCase("tr")
      .replace(/[çğıİöşü]/g, (c) => map[c] ?? c)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "oyuncu"
  );
}

async function optional<T>(q: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[] | null> {
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error) || /column/i.test(error.message ?? "")) return null;
    throw new HttpError(500, error.message);
  }
  return data ?? [];
}

/**
 * Ortak sosyal medya akışı.
 *  ?scope=all (varsayılan) | me (benim hakkımdakiler) | company&id=<şirket> (profil sayfası)
 */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const state = await loadCompany(user.id);
  const me = state?.company.id ?? null;

  let q = db().from("social_posts").select("*").order("created_at", { ascending: false }).limit(50);
  if (scope === "me") {
    if (!me) return { ready: true, canPost: false, posts: [] };
    q = q.eq("company_id", me);
  } else if (scope === "company") {
    q = q.eq("company_id", url.searchParams.get("id") ?? "").limit(20);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return { ready: false, canPost: false, posts: [] };
    throw new HttpError(500, error.message);
  }
  const posts = data ?? [];
  const postIds = posts.map((p) => p.id);

  const [likes, comments] = await Promise.all([
    postIds.length ? optional<{ post_id: number; company_id: string }>(db().from("post_likes").select("post_id, company_id").in("post_id", postIds)) : Promise.resolve([]),
    postIds.length ? optional<any>(db().from("post_comments").select("*").in("post_id", postIds).order("created_at")) : Promise.resolve([]),
  ]);
  const social = likes !== null && comments !== null; // 008 çalıştırıldı mı

  const ids = Array.from(new Set([...posts.map((p) => p.company_id), ...(comments ?? []).map((c) => c.company_id)].filter(Boolean)));
  const cos = new Map<string, { name: string; founderName: string; logo: unknown; logoUrl: string | null; portraitUrl: string | null; character: unknown }>();
  if (ids.length) {
    const { data: rows } = await db().from("companies").select("*").in("id", ids);
    for (const c of rows ?? []) cos.set(c.id, { name: c.name, founderName: c.founder_name, logo: c.logo, logoUrl: c.logo_url ?? null, portraitUrl: c.portrait_url ?? null, character: c.character });
  }
  const gone = { name: "Kapanmış şirket", founderName: "", logo: null, logoUrl: null, portraitUrl: null, character: null };

  return {
    ready: true,
    canPost: social && !!me,
    isAdmin: user.isAdmin,
    posts: posts.map((p) => ({
      id: p.id,
      kind: (p.kind as string) ?? "npc",
      author: p.author,
      handle: p.handle,
      text: p.text,
      repDelta: p.rep_delta,
      at: p.created_at,
      company: p.company_id ? { id: p.company_id, ...(cos.get(p.company_id) ?? gone) } : null,
      mine: !!me && p.company_id === me,
      canDelete: (p.kind === "player" && p.company_id === me) || user.isAdmin,
      likes: (likes ?? []).filter((l) => l.post_id === p.id).length,
      liked: (likes ?? []).some((l) => l.post_id === p.id && l.company_id === me),
      comments: (comments ?? [])
        .filter((c) => c.post_id === p.id)
        .map((c) => ({ id: c.id, text: c.text, at: c.created_at, company: { id: c.company_id, ...(cos.get(c.company_id) ?? gone) }, canDelete: c.company_id === me || user.isAdmin })),
    })),
  };
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const me = state.company;
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const postId = Math.trunc(Number(body.postId));
  const fail = (error: any) => {
    if (isMissingTable(error) || /column .*kind/i.test(error?.message ?? "")) throw new HttpError(503, NEED);
    throw new HttpError(500, error.message);
  };

  switch (body.action) {
    case "post": {
      const text = String(body.text ?? "").trim().replace(/\s+\n/g, "\n");
      if (text.length < 1 || text.length > 280) throw new HttpError(400, "Paylaşım 1-280 karakter olmalı");
      const { count, error: cErr } = await db().from("social_posts").select("id", { count: "exact", head: true }).eq("company_id", me.id).eq("kind", "player").gte("created_at", hourAgo);
      if (cErr) fail(cErr);
      if ((count ?? 0) >= POSTS_PER_HOUR) throw new HttpError(429, `Saatte en fazla ${POSTS_PER_HOUR} paylaşım yapabilirsin`);
      const { error } = await db().from("social_posts").insert({ company_id: me.id, kind: "player", event: "player", author: me.founder_name, handle: slug(me.name), text, rep_delta: 0 });
      if (error) fail(error);
      return { ok: true, message: "Paylaşıldı." };
    }
    case "like":
    case "unlike": {
      if (!postId) throw new HttpError(400, "Paylaşım geçersiz");
      const q = body.action === "like"
        ? db().from("post_likes").insert({ post_id: postId, company_id: me.id })
        : db().from("post_likes").delete().eq("post_id", postId).eq("company_id", me.id);
      const { error } = await q;
      if (error && error.code !== "23505" && !/duplicate/i.test(error.message)) fail(error);
      return { ok: true };
    }
    case "comment": {
      const text = String(body.text ?? "").trim();
      if (!postId) throw new HttpError(400, "Paylaşım geçersiz");
      if (text.length < 1 || text.length > 280) throw new HttpError(400, "Yorum 1-280 karakter olmalı");
      const { count, error: cErr } = await db().from("post_comments").select("id", { count: "exact", head: true }).eq("company_id", me.id).gte("created_at", hourAgo);
      if (cErr) fail(cErr);
      if ((count ?? 0) >= COMMENTS_PER_HOUR) throw new HttpError(429, `Saatte en fazla ${COMMENTS_PER_HOUR} yorum yazabilirsin`);
      const { error } = await db().from("post_comments").insert({ post_id: postId, company_id: me.id, text });
      if (error) fail(error);
      return { ok: true };
    }
    case "delete": {
      const { data: p } = await db().from("social_posts").select("id, kind, company_id").eq("id", postId).maybeSingle();
      if (!p) throw new HttpError(404, "Paylaşım bulunamadı");
      if (!user.isAdmin && !(p.kind === "player" && p.company_id === me.id)) throw new HttpError(403, "Yalnızca kendi paylaşımını silebilirsin");
      const { error } = await db().from("social_posts").delete().eq("id", postId);
      if (error) fail(error);
      return { ok: true, message: "Paylaşım silindi." };
    }
    case "deleteComment": {
      const id = Math.trunc(Number(body.commentId));
      const { data: c } = await db().from("post_comments").select("id, company_id").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "Yorum bulunamadı");
      if (!user.isAdmin && c.company_id !== me.id) throw new HttpError(403, "Yalnızca kendi yorumunu silebilirsin");
      const { error } = await db().from("post_comments").delete().eq("id", id);
      if (error) fail(error);
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }
});
