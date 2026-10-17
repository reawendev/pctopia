import { formatMoney } from "@/lib/game/economy";
import {
  ACTIVITIES, ACTIVITY_BY_ID, ACTIVITY_COOLDOWN_MIN, activityGain, lifestyleMultiplier, MEET_COOLDOWN_MIN, MEET_COST, NPC_BY_ID,
  NPCS, PROPOSE_MIN, proposalChance, RING_COST, ROMANCE_FROM, stageOf, stageRank, STAGE_LABEL, WEDDING_COST, type Npc,
} from "@/lib/game/life";
import { loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import { gameContext, type GameContext } from "@/lib/server/context";
import { loadRelations } from "@/lib/server/life";
import { postAbout } from "@/lib/server/social";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED_MIGRATION = "Hayat için veritabanında 005_atolye_sosyal_hayat.sql çalıştırılmalı";

type Rel = Awaited<ReturnType<typeof loadRelations>>[number];

function costs(g: GameContext) {
  const k = lifestyleMultiplier(g.stageLevel);
  const r = (n: number) => Math.round((n * k) / 10) * 10;
  return {
    meet: r(MEET_COST),
    ring: r(RING_COST),
    wedding: r(WEDDING_COST),
    activities: Object.fromEntries(ACTIVITIES.map((a) => [a.id, r(a.cost)])) as Record<string, number>,
  };
}

async function snapshot(userId: string, extra: Record<string, unknown> = {}) {
  const g = await gameContext(userId);
  const { error: probe } = await db().from("relationships").select("npc_id").limit(1);
  if (probe) return { ready: false, ...extra };
  const rels = await loadRelations(g.company.id);
  const now = Date.now();
  const c = costs(g);
  const lastMeet = g.company.last_meet_at ? new Date(g.company.last_meet_at).getTime() : 0;
  return {
    ready: true,
    costs: c,
    perks: g.perks,
    meetReadyAt: rels.length === 0 ? now : lastMeet + MEET_COOLDOWN_MIN * 60_000,
    firstMeetFree: rels.length === 0,
    unmet: NPCS.length - rels.length,
    people: rels
      .map((r) => {
        const npc = NPC_BY_ID[r.npc_id];
        if (!npc) return null;
        const stage = stageOf(r.effective, r.engaged, r.married);
        return {
          npc,
          affection: r.effective,
          stage,
          stageLabel: STAGE_LABEL[stage],
          engaged: r.engaged,
          married: r.married,
          readyAt: r.last_date_at ? new Date(r.last_date_at).getTime() + ACTIVITY_COOLDOWN_MIN * 60_000 : now,
          metAt: r.met_at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.affection - a!.affection),
    serverTime: now,
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return snapshot(user.id);
});

async function save(g: GameContext, npcId: string, cost: number, affection: number, engaged: boolean, married: boolean, meet = false, date = true) {
  const { error } = await db().rpc("life_apply", {
    p_company: g.company.id,
    p_npc: npcId,
    p_cost: cost,
    p_affection: Math.max(0, Math.min(100, Math.round(affection))),
    p_engaged: engaged,
    p_married: married,
    p_meet: meet,
    p_date: date,
  });
  if (error) {
    if (/Yetersiz nakit/.test(error.message)) throw new HttpError(400, `Bunun için kasada ${formatMoney(cost)} olmalı`);
    throw new HttpError(500, error.message);
  }
}

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const g = await gameContext(user.id);
  const { error: probe } = await db().from("relationships").select("npc_id").limit(1);
  if (probe) throw new HttpError(503, NEED_MIGRATION);

  const rels = await loadRelations(g.company.id);
  const c = costs(g);
  const now = Date.now();
  const vars = (npc: Npc) => ({ company: g.company.name, founder: g.company.founder_name, npc: npc.name });
  const getRel = (): { rel: Rel; npc: Npc } => {
    const id = String(body.npcId ?? "");
    const rel = rels.find((r) => r.npc_id === id);
    const npc = NPC_BY_ID[id];
    if (!rel || !npc) throw new HttpError(404, "Bu kişiyle henüz tanışmadın");
    return { rel, npc };
  };
  const partner = rels.find((r) => r.engaged || r.married || r.effective >= ROMANCE_FROM);
  let message = "";

  switch (action) {
    case "meet": {
      const free = rels.length === 0;
      const last = g.company.last_meet_at ? new Date(g.company.last_meet_at).getTime() : 0;
      if (!free && now - last < MEET_COOLDOWN_MIN * 60_000) {
        throw new HttpError(429, `Yeni bir davet için ${Math.ceil((last + MEET_COOLDOWN_MIN * 60_000 - now) / 60000)} dakika beklemelisin`);
      }
      const pool = NPCS.filter((n) => !rels.some((r) => r.npc_id === n.id));
      if (pool.length === 0) throw new HttpError(400, "Şehirdeki herkesle tanıştın");
      const npc = pool[Math.floor(Math.random() * pool.length)];
      await save(g, npc.id, free ? 0 : c.meet, 5 + Math.floor(Math.random() * 6), false, false, true, false);
      await logEvent(g.company.id, "life", `${free ? "Mahalledeki kafede" : "Bir iş davetinde"} ${npc.name} ile tanıştın (${npc.job}).`, free ? undefined : -c.meet);
      message = `${npc.name} ile tanıştın. ${npc.job}.`;
      break;
    }
    case "activity": {
      const { rel, npc } = getRel();
      const act = ACTIVITY_BY_ID[String(body.activityId ?? "")];
      if (!act) throw new HttpError(400, "Etkinlik geçersiz");
      const stage = stageOf(rel.effective, rel.engaged, rel.married);
      if (stageRank(stage) < stageRank(act.minStage)) throw new HttpError(400, `${act.name} için yakınlık seviyesi en az “${STAGE_LABEL[act.minStage]}” olmalı`);
      const ready = rel.last_date_at ? new Date(rel.last_date_at).getTime() + ACTIVITY_COOLDOWN_MIN * 60_000 : 0;
      if (now < ready) throw new HttpError(429, `${npc.name} şu an müsait değil. ${Math.ceil((ready - now) / 60000)} dakika sonra tekrar dene.`);

      const gain = activityGain(npc, act, Math.random());
      let next = rel.effective + gain;
      // Aynı anda tek romantik ilişki: başkasıyla birlikteyken diğerleri arkadaş kalır
      const capped = partner && partner.npc_id !== npc.id && next >= ROMANCE_FROM;
      if (capped) next = ROMANCE_FROM - 1;
      const cost = c.activities[act.id];
      await save(g, npc.id, cost, next, rel.engaged, rel.married);

      const before = stageOf(rel.effective, rel.engaged, rel.married);
      const after = stageOf(Math.min(100, next), rel.engaged, rel.married);
      if (before !== "sevgili" && after === "sevgili") await postAbout(g.company.id, "dating", vars(npc), g.perks.press);
      const mood = gain >= act.gain + 3 ? "Çok keyifli geçti." : gain <= act.gain - 4 ? "Pek hoşuna gitmedi." : "Güzel vakit geçirdiniz.";
      await logEvent(g.company.id, "life", `${npc.name} ile etkinlik: ${act.name}. ${mood}`, -cost);
      message = `${mood}${after !== before ? ` Yeni durum: ${STAGE_LABEL[after]}.` : ""}${capped ? " Zaten bir ilişkin olduğu için arkadaş kaldınız." : ""}`;
      break;
    }
    case "propose": {
      const { rel, npc } = getRel();
      if (rel.engaged || rel.married) throw new HttpError(400, "Zaten nişanlısınız");
      if (rel.effective < PROPOSE_MIN) throw new HttpError(400, `Evlenme teklifi için yakınlığınız en az ${PROPOSE_MIN} olmalı`);
      const yes = Math.random() < proposalChance(rel.effective);
      if (yes) {
        await save(g, npc.id, c.ring, rel.effective + 5, true, false);
        await postAbout(g.company.id, "engaged", vars(npc), g.perks.press);
        await logEvent(g.company.id, "life", `${npc.name} evlenme teklifini kabul etti. Nişanlandınız!`, -c.ring);
        message = `${npc.name} evet dedi! Nişanlandınız.`;
      } else {
        await save(g, npc.id, c.ring, rel.effective - 15, false, false);
        await postAbout(g.company.id, "rejected", vars(npc), g.perks.press);
        await logEvent(g.company.id, "life", `${npc.name} evlenme teklifini şimdilik geri çevirdi.`, -c.ring);
        message = `${npc.name} henüz hazır olmadığını söyledi. Yakınlığınız azaldı.`;
      }
      break;
    }
    case "wedding": {
      const { rel, npc } = getRel();
      if (!rel.engaged || rel.married) throw new HttpError(400, "Düğün için önce nişanlanmalısınız");
      await save(g, npc.id, c.wedding, rel.effective + 10, true, true);
      await postAbout(g.company.id, "wedding", vars(npc), g.perks.press);
      await logEvent(g.company.id, "life", `${npc.name} ile evlendiniz. Tebrikler!`, -c.wedding);
      message = `${npc.name} ile evlendiniz!`;
      break;
    }
    case "breakup": {
      const { rel, npc } = getRel();
      if (!(rel.engaged || rel.married || rel.effective >= ROMANCE_FROM)) throw new HttpError(400, "Aranızda romantik bir ilişki yok");
      await save(g, npc.id, 0, 15, false, false, false, false);
      await postAbout(g.company.id, "breakup", vars(npc), g.perks.press);
      await logEvent(g.company.id, "life", `${npc.name} ile yollarınızı ayırdınız.`);
      message = `${npc.name} ile yollarınızı ayırdınız.`;
      break;
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }

  const fresh = await loadCompany(user.id);
  const journal = await loadJournal(g.company.id);
  return snapshot(user.id, { message, journal, state: view(fresh!.company, fresh!.owned, fresh!.holdings) });
});
