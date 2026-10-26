import { NextResponse } from "next/server";
import { EQUIPMENT_BY_ID, OFFLINE_CAP_HOURS } from "@/lib/game/config";
import { incomePerHour, type Owned } from "@/lib/game/economy";
import { isMissingTable } from "@/lib/server/company";
import { MAX_OPEN, OFFER_EVERY_MIN } from "@/lib/server/offers";
import { ONLINE_MS, pushEnabled, sendToSubs, type PushPayload } from "@/lib/server/push";
import { db } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

/** Bir kontrolde en fazla bu kadar geriye bakılır (zamanlayıcı uzun süre durduysa eski olaylar için bildirim yağmasın). */
const MAX_WINDOW_MS = 30 * 60_000;

/**
 * Zamanlayıcı (Supabase pg_cron, 2 dakikada bir) çağırır. Oyunun durumunu DEĞİŞTİRMEZ, yalnızca okur:
 *  - süren bir işin sonucu hazır oldu
 *  - masaya yeni teklif düşme zamanı geldi (teklif oyuncu oyunu açınca oluşur)
 *  - kasa sınırı doldu, yeni gelir birikmiyor
 * Olayın zamanı son kontrolden bu yana ise bildirim gider; böylece her olay bir kez bildirilir.
 * Oyuncu o an oyundaysa bildirim gönderilmez.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  if (!pushEnabled()) return NextResponse.json({ ok: true, skipped: "vapid" });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: subs, error } = await db().from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: true, skipped: "tablo" });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id as string)));
  if (!userIds.length) return NextResponse.json({ ok: true, users: 0 });

  const [{ data: states }, { data: companies }] = await Promise.all([
    db().from("push_state").select("user_id, last_checked, last_seen").in("user_id", userIds),
    db().from("companies").select("id, owner_id, last_collected_at").in("owner_id", userIds),
  ]);
  const stateBy = new Map((states ?? []).map((s) => [s.user_id as string, s]));
  const companyByUser = new Map((companies ?? []).map((c) => [c.owner_id as string, c]));
  const companyIds = (companies ?? []).map((c) => c.id as string);

  // Pencerenin başı: son kontrol (en fazla 30 dk geriye). İlk kez görülen oyuncu için bildirim yok.
  const startOf = (uid: string) => {
    const lc = stateBy.get(uid)?.last_checked;
    return lc ? Math.max(new Date(lc).getTime(), now - MAX_WINDOW_MS) : now;
  };
  const minStart = Math.min(...userIds.map(startOf));
  const offerGap = OFFER_EVERY_MIN * 60_000;

  const [eq, staff, ready, recent, open] = companyIds.length
    ? await Promise.all([
        db().from("company_equipment").select("company_id, equipment_id, qty").in("company_id", companyIds),
        db().from("employees").select("company_id, role").in("company_id", companyIds),
        db()
          .from("company_offers")
          .select("company_id, subject, resolves_at")
          .in("company_id", companyIds)
          .eq("status", "active")
          .gt("resolves_at", new Date(minStart).toISOString())
          .lte("resolves_at", nowIso),
        db().from("company_offers").select("company_id, created_at").in("company_id", companyIds).gt("created_at", new Date(minStart - offerGap).toISOString()),
        db().from("company_offers").select("company_id").in("company_id", companyIds).eq("status", "open").gt("expires_at", nowIso),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const owned = new Map<string, Owned>();
  for (const r of eq.data ?? []) {
    if (!EQUIPMENT_BY_ID[r.equipment_id]) continue;
    const o = owned.get(r.company_id) ?? {};
    o[r.equipment_id] = r.qty;
    owned.set(r.company_id, o);
  }
  const accountant = new Set((staff.data ?? []).filter((r: any) => r.role === "muhasebeci").map((r: any) => r.company_id as string));
  const lastOffer = new Map<string, number>();
  for (const r of recent.data ?? []) {
    const t = new Date(r.created_at).getTime();
    if (t > (lastOffer.get(r.company_id) ?? 0)) lastOffer.set(r.company_id, t);
  }
  const openCount = new Map<string, number>();
  for (const r of open.data ?? []) openCount.set(r.company_id, (openCount.get(r.company_id) ?? 0) + 1);

  let sent = 0;
  let notified = 0;
  for (const uid of userIds) {
    const c = companyByUser.get(uid);
    const start = startOf(uid);
    const st = stateBy.get(uid);
    const online = !!st?.last_seen && now - new Date(st.last_seen).getTime() < ONLINE_MS;
    if (!c || online || start >= now) continue;
    const inWindow = (t: number) => t > start && t <= now;
    const events: PushPayload[] = [];

    // 1) Sonucu hazır işler
    const done = (ready.data ?? []).filter((o) => o.company_id === c.id && inWindow(new Date(o.resolves_at!).getTime()));
    if (done.length === 1) events.push({ title: "İşin sonucu geldi", body: `“${done[0].subject}” sonuçlandı. Ne kazandığını gör.`, url: "/oyun?sekme=posta", tag: "teklif" });
    else if (done.length > 1) events.push({ title: "İşlerin sonuçlandı", body: `${done.length} işin sonucu masanda.`, url: "/oyun?sekme=posta", tag: "teklif" });

    // 2) Yeni teklif zamanı
    const last = lastOffer.get(c.id);
    if (last && inWindow(last + offerGap) && (openCount.get(c.id) ?? 0) < MAX_OPEN) {
      events.push({ title: "Masana yeni bir teklif düştü", body: "Bir müşteri seninle çalışmak istiyor. Süresi dolmadan yanıtla.", url: "/oyun?sekme=posta", tag: "yeni-teklif" });
    }

    // 3) Kasa sınırı doldu (muhasebeci varsa kendisi topluyor)
    const rate = incomePerHour(owned.get(c.id) ?? {});
    if (rate > 0 && !accountant.has(c.id)) {
      const capAt = new Date(c.last_collected_at).getTime() + OFFLINE_CAP_HOURS * 3_600_000;
      if (inWindow(capAt)) events.push({ title: "Kasa doldu", body: `${OFFLINE_CAP_HOURS} saatlik gelir birikti, yeni gelir birikmiyor. Tahsilat yap.`, url: "/oyun", tag: "kasa" });
    }

    if (!events.length) continue;
    const payload: PushPayload =
      events.length === 1 ? events[0] : { title: "PCTopia", body: events.map((e) => e.title).join(" · "), url: events[0].url, tag: "ozet" };
    notified++;
    sent += await sendToSubs((subs ?? []).filter((s) => s.user_id === uid) as any, payload);
  }

  // Herkesin son kontrol zamanını ilerlet (son görülme alanına dokunmadan)
  const { error: upErr } = await db()
    .from("push_state")
    .upsert(userIds.map((u) => ({ user_id: u, last_checked: nowIso })), { onConflict: "user_id", ignoreDuplicates: false });
  if (upErr) console.error("push_state", upErr.message);

  return NextResponse.json({ ok: true, users: userIds.length, notified, sent });
}

export const GET = run;
export const POST = run;
