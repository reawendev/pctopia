// Bir isteğin oyun bağlamı: şirket, net değer, kariyer basamağı, itibar ve ilişki yararları.

import type { Perk } from "../game/life";
import { stageFor } from "../game/stages";
import { companyNetWorth, loadCompany, type CompanyRow } from "./company";
import { companyPerks } from "./life";
import { techPerks } from "./research";
import { HttpError } from "./supabase";
import { SALES_MANAGER_BONUS } from "../game/finance";
import type { Owned } from "../game/economy";
import type { Holdings } from "../game/market";

export type GameContext = {
  company: CompanyRow;
  owned: Owned;
  holdings: Holdings;
  netWorth: number;
  stageLevel: number;
  reputation: number;
  perks: Record<Perk, number>;
  /** atölye/sosyal fonksiyonlarının beklediği kısa biçim */
  ctx: { id: string; name: string; reputation: number; stageLevel: number; perks: Record<Perk, number> };
};

export async function gameContext(userId: string): Promise<GameContext> {
  const state = await loadCompany(userId);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const { company, owned, holdings } = state;
  const netWorth = companyNetWorth(company.cash, owned, holdings, undefined, company._extra ?? 0);
  const stageLevel = stageFor(netWorth).stage.level;
  const reputation = company.reputation ?? 50;
  const perks = await companyPerks(company.id);
  // Satış müdürü: pazarda çekicilik +%15
  if (company._staff?.includes("satis")) perks.demand += SALES_MANAGER_BONUS;
  // Ar-Ge
  const tech = (await techPerks([company.id])).get(company.id)!;
  perks.parts += tech.parts;
  perks.demand += tech.demand;
  perks.premium += tech.premium;
  return {
    company,
    owned,
    holdings,
    netWorth,
    stageLevel,
    reputation,
    perks,
    ctx: { id: company.id, name: company.name, reputation, stageLevel, perks },
  };
}
