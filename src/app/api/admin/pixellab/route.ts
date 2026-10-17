import { getBalance, pixellabEnabled } from "@/lib/server/pixellab";
import { db, handle, requireAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  if (!pixellabEnabled()) return { enabled: false, balance: null, error: "PIXELLAB_API_KEY tanımlı değil" };

  let balance: number | null = null;
  let error: string | null = null;
  try {
    balance = await getBalance();
  } catch (e: any) {
    error = e.message;
  }

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data } = await db().from("asset_generations").select("cost_usd").gte("created_at", since);
  const today = (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  return { enabled: true, balance, error, last24h: { count: data?.length ?? 0, usd: today } };
});
