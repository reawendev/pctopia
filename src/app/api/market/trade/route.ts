import { pendingIncome } from "@/lib/game/economy";
import { buyTotal, sellTotal, STOCK_BY_ID } from "@/lib/game/market";
import { isMissingTable, loadCompany, view } from "@/lib/server/company";
import { snapshot } from "@/lib/server/market";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const MAX_SHARES = 1_000_000_000;

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const stockId = String(body.stockId ?? "");
  const side = body.side === "sell" ? "sell" : body.side === "buy" ? "buy" : null;
  const shares = Math.trunc(Number(body.shares));

  if (!STOCK_BY_ID[stockId]) throw new HttpError(400, "Bilinmeyen hisse");
  if (!side) throw new HttpError(400, "İşlem türü geçersiz");
  if (!Number.isFinite(shares) || shares < 1 || shares > MAX_SHARES) throw new HttpError(400, "Adet geçersiz");

  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await loadCompany(user.id);
    if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
    const { company, owned, holdings } = state;

    const now = Date.now();
    const price = snapshot(now).prices[stockId];
    const gain = pendingIncome(owned, new Date(company.last_collected_at).getTime(), now);
    const cash = Number(company.cash) + gain;
    const pos = holdings[stockId] ?? { shares: 0, costBasis: 0 };

    let newCash: number, newShares: number, newBasis: number, total: number;
    if (side === "buy") {
      total = buyTotal(shares, price);
      if (total > cash) throw new HttpError(400, "Yeterli nakit yok");
      newCash = cash - total;
      newShares = pos.shares + shares;
      newBasis = pos.costBasis + total;
    } else {
      if (shares > pos.shares) throw new HttpError(400, "Elinde bu kadar hisse yok");
      total = sellTotal(shares, price);
      newCash = cash + total;
      newShares = pos.shares - shares;
      newBasis = newShares === 0 ? 0 : Math.round(pos.costBasis * (newShares / pos.shares));
    }

    const { data: ok, error } = await db().rpc("apply_trade", {
      p_company: company.id,
      p_version: company.version,
      p_new_cash: newCash,
      p_stock: stockId,
      p_new_shares: newShares,
      p_new_cost_basis: newBasis,
      p_side: side,
      p_shares: shares,
      p_price: price,
      p_total: total,
    });
    if (error) {
      if (isMissingTable(error) || /apply_trade/i.test(error.message)) {
        throw new HttpError(503, "Borsa henüz etkin değil: veritabanında 002_borsa.sql çalıştırılmalı");
      }
      throw new HttpError(500, error.message);
    }
    if (ok) {
      const fresh = await loadCompany(user.id);
      return { trade: { stockId, side, shares, price, total }, ...view(fresh!.company, fresh!.owned, fresh!.holdings) };
    }
  }
  throw new HttpError(409, "Eşzamanlı işlem, tekrar dene");
});
