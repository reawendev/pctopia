"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/supabase/client";

type Status =
  | "loading"
  | "off" // sunucuda kapalı ya da tarayıcı desteklemiyor
  | "ios-install" // iPhone/iPad: önce ana ekrana eklenmeli
  | "denied"
  | "available" // izin istenebilir
  | "on";

const DISMISS_KEY = "pct-push-dismissed";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Bildirim durumu ve aç/kapat işlemleri. Service worker'ı da kaydeder (ana ekrana ekleme için de gerekir). */
export function usePush(notify: (m: string) => void) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return setStatus(isIos() && !standalone() && key ? "ios-install" : "off");
    const reg = await registration().catch(() => null);
    if (!reg || !key) return setStatus("off");
    const server = await apiFetch<{ enabled: boolean }>("/api/push").catch(() => ({ enabled: false }));
    if (!server.enabled) return setStatus("off");
    if (Notification.permission === "denied") return setStatus("denied");
    const sub = await reg.pushManager.getSubscription();
    setStatus(sub && Notification.permission === "granted" ? "on" : "available");
  }, []);

  useEffect(() => {
    refresh().catch(() => setStatus("off"));
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "available");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
      await apiFetch("/api/push", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
      setStatus("on");
    } catch (e: any) {
      notify(e?.message || "Bildirimler açılamadı");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setStatus("available");
      notify("Bu cihazda bildirimler kapatıldı.");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      await apiFetch("/api/push", { method: "POST", body: JSON.stringify({ test: true }) });
      notify("Deneme bildirimi gönderildi.");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }, [notify]);

  return { status, busy, enable, disable, test };
}

/** Ofis ekranındaki davet kartı: yalnızca açılabilir durumdaysa ve oyuncu kapatmadıysa görünür. */
export function PushInvite({ push }: { push: ReturnType<typeof usePush> }) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  if (dismissed || (push.status !== "available" && push.status !== "ios-install")) return null;

  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-3 border-amber/40 p-4">
      <div className="flex min-w-0 basis-full items-center gap-4 sm:flex-1 sm:basis-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Oyun kapalıyken de haberin olsun</div>
        <p className="text-xs leading-relaxed text-mute">
          {push.status === "ios-install"
            ? "iPhone'da bildirim için: Safari'de Paylaş → Ana Ekrana Ekle, sonra PCTopia'yı ana ekrandan aç."
            : "İşin sonuçlanınca, masana teklif düşünce, kasa dolunca ve posta gelince bildirim gönderelim."}
        </p>
      </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <button type="button" className="text-sm text-mute hover:text-white" onClick={hide}>
          Şimdi değil
        </button>
        {push.status === "available" && (
          <button type="button" className="btn btn-primary !py-2" disabled={push.busy} onClick={push.enable}>
            Bildirimleri aç
          </button>
        )}
      </div>
    </section>
  );
}

/** Sayfa altındaki küçük ayar satırı. */
export function PushSetting({ push }: { push: ReturnType<typeof usePush> }) {
  if (push.status === "loading" || push.status === "off" || push.status === "ios-install") return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-mute">Bildirimler:</span>
      {push.status === "on" ? (
        <>
          <span className="text-gain">açık</span>
          <button type="button" className="text-amber hover:text-amber-soft" disabled={push.busy} onClick={push.test}>
            Deneme gönder
          </button>
          <button type="button" className="text-mute hover:text-white" disabled={push.busy} onClick={push.disable}>
            Kapat
          </button>
        </>
      ) : push.status === "denied" ? (
        <span className="text-mute">tarayıcı ayarlarından engellenmiş</span>
      ) : (
        <button type="button" className="text-amber hover:text-amber-soft" disabled={push.busy} onClick={push.enable}>
          Aç
        </button>
      )}
    </div>
  );
}
