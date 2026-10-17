import { describeEffects } from "@/lib/game/events";
import { recentEvents } from "@/lib/server/events";
import { loadSeasons, nextMondayIstanbul } from "@/lib/server/seasons";
import { handle, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Dünya gündemi (şu anki ve geçmiş olaylar) ve sezon bilgisi. */
export const GET = handle(async (req) => {
  await requireUser(req);
  const events = recentEvents(4).map((e) => ({ id: e.id, title: e.title, text: e.text, effects: describeEffects(e.effects), startsAt: e.startsAt, endsAt: e.endsAt }));
  const s = await loadSeasons();
  return {
    serverTime: Date.now(),
    event: events[0],
    pastEvents: events.slice(1),
    season: s?.current
      ? { number: s.current.number, startedAt: s.current.started_at, suggestedEndAt: nextMondayIstanbul() }
      : null,
    hallOfFame: (s?.past ?? []).map((p) => ({ number: p.number, startedAt: p.started_at, endedAt: p.ended_at, champions: p.champions })),
  };
});
