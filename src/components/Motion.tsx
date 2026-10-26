"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

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

/** Ekran dar mı (telefon / dikey tablet). SSR'da false. */
export function useIsMobile(query = "(max-width: 1023px)") {
  const [m, setM] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/**
 * Yatay kaydırma hareketi: sola kaydırınca `onNext`, sağa kaydırınca `onPrev`.
 * Yatay kaydırılabilen alanlarda (borsa tablosu, alt sekmeler, kayan haber bandı) ve form öğelerinde devreye girmez.
 */
export function useSwipe(el: HTMLElement | null, onNext: () => void, onPrev: () => void, enabled = true) {
  const handlers = useRef({ onNext, onPrev });
  handlers.current = { onNext, onPrev };

  useLayoutEffect(() => {
    if (!el || !enabled) return;
    let sx = 0;
    let sy = 0;
    let t0 = 0;
    let active = false;

    const scrollsX = (n: Element | null): boolean => {
      for (let x = n; x && x !== el; x = x.parentElement) {
        if (x.matches("input, textarea, select, [data-noswipe]")) return true;
        if (x.scrollWidth > x.clientWidth + 2) {
          const ov = getComputedStyle(x).overflowX;
          if (ov === "auto" || ov === "scroll") return true;
        }
      }
      return false;
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (active = false);
      const t = e.touches[0];
      active = !scrollsX(e.target as Element);
      sx = t.clientX;
      sy = t.clientY;
      t0 = performance.now();
    };
    const end = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const fast = performance.now() - t0 < 600;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8 && fast) {
        if (dx < 0) handlers.current.onNext();
        else handlers.current.onPrev();
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
  }, [el, enabled]);
}
