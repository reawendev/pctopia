import { isMissingTable, loadCompany } from "@/lib/server/company";
import { snapshot } from "@/lib/server/market";
import { db, handle, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const snap = snapshot();

  let trades: any[] = [];
  const state = await loadCompany(user.id);
  if (state) {
    const { data, error } = await db()
      .from("trades")
      .select("id, stock_id, side, shares, price, total, created_at")
      .eq("company_id", state.company.id)
      .order("created_at", { ascending: false })
      .limit(15);
    if (!error) trades = data ?? [];
    else if (!isMissingTable(error)) console.error(error);
  }

  return {
    tick: snap.tick,
    nextTickAt: snap.nextTickAt,
    serverTime: Date.now(),
    quotes: snap.quotes,
    news: snap.news,
    trades: trades.map((t) => ({
      id: t.id,
      stockId: t.stock_id,
      side: t.side,
      shares: Number(t.shares),
      price: Number(t.price),
      total: Number(t.total),
      at: t.created_at,
    })),
  };
});
