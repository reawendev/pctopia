"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Toast = { id: number; msg: string; leaving: boolean };

const LIFE_MS = 3600;
const LEAVE_MS = 240;
const MAX = 3;

/**
 * Bildirim yığını. `notify` sabit kimliklidir (bileşenlerin efekt bağımlılıklarında güvenle kullanılır).
 * Yeni bildirim alttan yaylanarak girer, eskiler yukarı itilir; süre dolunca ya da dokununca solarak çıkar.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        setToasts((ts) => ts.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, LEAVE_MS)
    );
  }, []);

  const notify = useCallback(
    (msg: string) => {
      if (!msg) return;
      const id = ++seq.current;
      setToasts((ts) => {
        // Aynı mesaj üst üste gelirse yenisini ekleme
        if (ts.some((t) => !t.leaving && t.msg === msg)) return ts;
        const next = [...ts, { id, msg, leaving: false }];
        // Fazlası en eskiden başlayarak çıkar
        const live = next.filter((t) => !t.leaving);
        if (live.length > MAX) setTimeout(() => dismiss(live[0].id), 0);
        return next;
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFE_MS)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const node = (
    <div className="toast-stack" aria-live="polite" role="status">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="toast" data-leaving={t.leaving || undefined} onClick={() => dismiss(t.id)}>
          {t.msg}
        </button>
      ))}
    </div>
  );

  return { notify, node };
}
