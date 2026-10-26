// Web bildirimleri (Web Push / VAPID) — YALNIZCA SUNUCU.
//
// Ortam değişkenleri: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, isteğe bağlı VAPID_SUBJECT (mailto:...).
// Anahtarlar yoksa ya da 014 göçü çalıştırılmadıysa bildirimler sessizce devre dışı kalır, oyun etkilenmez.

import webpush from "web-push";
import { isMissingTable } from "./company";
import { db } from "./supabase";

export type PushPayload = {
  title: string;
  body: string;
  /** Bildirime dokununca açılacak sayfa */
  url?: string;
  /** Aynı etiketteki eski bildirimin yerine geçer (ör. "kasa") */
  tag?: string;
};

/** Oyun açıkken (son 90 sn içinde istek geldiyse) bildirim gönderme. */
export const ONLINE_MS = 90_000;

let configured: boolean | null = null;

export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:destek@pctopia.app", pub, priv);
  return (configured = true);
}

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Oyuncunun bütün cihazlarına gönderir; geçersizleşen abonelikleri siler. Gönderilen cihaz sayısını döndürür. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0;
  const { data, error } = await db().from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) {
    if (!isMissingTable(error)) console.error("push subs", error.message);
    return 0;
  }
  return sendToSubs((data ?? []) as SubRow[], payload);
}

export async function sendToSubs(subs: SubRow[], payload: PushPayload): Promise<number> {
  if (!pushEnabled() || subs.length === 0) return 0;
  const json = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json, { TTL: 60 * 60, urgency: "normal" });
        sent++;
      } catch (e: any) {
        // 404/410: tarayıcı aboneliği bitirmiş
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id);
        else console.error("push send", e?.statusCode, e?.body ?? e?.message);
      }
    })
  );
  if (dead.length) await db().from("push_subscriptions").delete().in("id", dead);
  return sent;
}

/** Oyun açıkken çağrılır (posta yoklaması): oyuncu çevrimiçi sayılır, bildirim gönderilmez. */
export async function markSeen(userId: string): Promise<void> {
  const { error } = await db().from("push_state").upsert({ user_id: userId, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
  if (error && !isMissingTable(error)) console.error("push seen", error.message);
}

/** Oyuncu şu an oyunda mı? */
export async function isOnline(userId: string): Promise<boolean> {
  const { data } = await db().from("push_state").select("last_seen").eq("user_id", userId).maybeSingle();
  return !!data?.last_seen && Date.now() - new Date(data.last_seen).getTime() < ONLINE_MS;
}
