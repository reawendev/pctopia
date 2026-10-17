import { randomUUID } from "node:crypto";
import { isValidCharacter, isValidLogo } from "@/lib/game/config";
import { logoPrompt, portraitPrompt } from "@/lib/game/prompts";
import { isMissingTable } from "@/lib/server/company";
import { generatePixflux, pixellabEnabled } from "@/lib/server/pixellab";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // PixelLab üretimi birkaç saniye ile yarım dakika arası sürebilir

const DAILY_LIMIT = 5; // tür başına, kullanıcı başına, 24 saatte

type Kind = "portrait" | "logo";

async function usedToday(userId: string, kind: Kind): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count, error } = await db()
    .from("asset_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .neq("prompt", "[yükleme]") // yüklemeler PixelLab hakkından düşülmez
    .gte("created_at", since);
  if (error) {
    if (isMissingTable(error)) throw new HttpError(503, "Görsel üretimi için veritabanında 003_gorseller_gunluk.sql çalıştırılmalı");
    throw new HttpError(500, error.message);
  }
  return count ?? 0;
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  if (!pixellabEnabled()) return { enabled: false, limit: DAILY_LIMIT, remaining: { portrait: 0, logo: 0 } };
  try {
    const [p, l] = await Promise.all([usedToday(user.id, "portrait"), usedToday(user.id, "logo")]);
    const left = (n: number) => (user.isAdmin ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - n));
    return { enabled: true, limit: DAILY_LIMIT, remaining: { portrait: left(p), logo: left(l) } };
  } catch (e) {
    if (e instanceof HttpError && e.status === 503) return { enabled: false, limit: DAILY_LIMIT, remaining: { portrait: 0, logo: 0 }, reason: e.message };
    throw e;
  }
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  if (!pixellabEnabled()) throw new HttpError(503, "Görsel üretimi şu an kapalı");
  const body = await req.json().catch(() => ({}));
  const kind: Kind | null = body.kind === "portrait" ? "portrait" : body.kind === "logo" ? "logo" : null;
  if (!kind) throw new HttpError(400, "Tür geçersiz");

  let prompt: { description: string; negative: string };
  if (kind === "portrait") {
    if (!isValidCharacter(body.character)) throw new HttpError(400, "Karakter seçimi geçersiz");
    prompt = portraitPrompt(body.character);
  } else {
    if (!isValidLogo(body.logo)) throw new HttpError(400, "Logo seçimi geçersiz");
    prompt = logoPrompt(body.logo);
  }

  if (!user.isAdmin && (await usedToday(user.id, kind)) >= DAILY_LIMIT) {
    throw new HttpError(429, `Bugünkü ${kind === "portrait" ? "portre" : "logo"} üretim hakkın doldu (${DAILY_LIMIT}). Yarın tekrar dene.`);
  }

  const size = kind === "portrait" ? 128 : 96;
  const { png, usd } = await generatePixflux({
    description: prompt.description,
    negative: prompt.negative,
    width: size,
    height: size,
    noBackground: kind === "logo",
  });

  const path = `${user.id}/${kind}-${randomUUID()}.png`;
  const up = await db().storage.from("generated").upload(path, png, { contentType: "image/png", upsert: false });
  if (up.error) throw new HttpError(500, "Görsel kaydedilemedi: " + up.error.message);
  const url = db().storage.from("generated").getPublicUrl(path).data.publicUrl;

  const { data, error } = await db()
    .from("asset_generations")
    .insert({ user_id: user.id, kind, path, url, prompt: prompt.description, cost_usd: usd })
    .select("id")
    .single();
  if (error) throw new HttpError(500, error.message);

  return { id: data.id, kind, url };
});
