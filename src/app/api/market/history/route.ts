import { STOCK_BY_ID } from "@/lib/game/market";
import { history, type Range } from "@/lib/server/market";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const RANGES: Range[] = ["1g", "1h", "1a"];

export const GET = handle(async (req) => {
  await requireUser(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const range = (url.searchParams.get("range") ?? "1g") as Range;
  if (!STOCK_BY_ID[id]) throw new HttpError(400, "Bilinmeyen hisse");
  if (!RANGES.includes(range)) throw new HttpError(400, "Geçersiz aralık");
  return { id, range, points: history(id, range) };
});
