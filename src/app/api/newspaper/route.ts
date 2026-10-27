import { edition } from "@/lib/server/newspaper";
import { handle, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Günün gazetesi. ?gun=0 bugün, 1 dün … (en fazla 6 gün geriye). */
export const GET = handle(async (req) => {
  await requireUser(req);
  const n = Number(new URL(req.url).searchParams.get("gun") ?? 0);
  const offset = Number.isFinite(n) ? Math.max(0, Math.min(6, Math.floor(n))) : 0;
  return edition(offset);
});
