import { rankCompanies } from "@/lib/server/ranking";
import { handle, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const ranked = (await rankCompanies()).map(({ ownerId, ...c }) => ({ ...c, isMe: ownerId === user.id }));
  return { total: ranked.length, top: ranked.slice(0, 50), me: ranked.find((c) => c.isMe) ?? null };
});
