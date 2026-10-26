"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

/**
 * Sekme çubuklarında etkin öğenin altında/arkasında kayan gösterge.
 * Kapsayıcıya `ref`, her düğmeye `data-key` verilir; gösterge etkin düğmenin konum ve genişliğine yaylanır.
 * İlk ölçümde animasyon yok: sayfa açılırken göstergenin soldan kayıp gelmesini önler.
 * `ref` bir geri çağırma ref'i: kapsayıcı sonradan bağlansa da (ör. yükleme perdesinden sonra) ölçüm yapılır.
 */
export function useSlidingIndicator(active: string) {
  const [el, ref] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`);
      if (!btn) return;
      const x = btn.offsetLeft;
      const w = btn.offsetWidth;
      setBox((b) => (b && b.x === x && b.w === w ? b : { x, w }));
    };
    measure();
    // Rozetler gelince düğme genişliği değişir: her düğmeyi ayrıca izle
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-key]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [el, active]);

  useLayoutEffect(() => {
    if (!box || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [box, animate]);

  const style: CSSProperties = box ? { width: box.w, transform: `translate3d(${box.x}px,0,0)`, opacity: 1 } : { width: 0, opacity: 0 };

  return { ref, style, animate: animate || undefined };
}

/** Sekme sırasına göre geçiş yönü: ileri giderken içerik sağdan, geri giderken soldan gelir. */
export function direction(order: readonly string[], from: string, to: string): 1 | -1 {
  return order.indexOf(to) >= order.indexOf(from) ? 1 : -1;
}
