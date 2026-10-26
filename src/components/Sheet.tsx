"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLOSE_MS = 320;

/**
 * iOS tarzı alt sayfa (telefon için). Alttan yaylanarak açılır; tutamaçtan aşağı sürükleyince,
 * arka plana dokununca ya da Escape ile kapanır. Açıkken sayfa kaydırması kilitlenir.
 */
export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  // Sürükleme: tutamaçtan ya da içerik en üstteyken aşağı çekince
  const onPointerDown = (e: React.PointerEvent) => {
    const body = panel.current?.querySelector<HTMLElement>("[data-sheet-body]");
    const fromHandle = (e.target as Element).closest("[data-sheet-handle]");
    if (!fromHandle && body && body.scrollTop > 0) return;
    if ((e.target as Element).closest("button, a, input, textarea, select")) return;
    start.current = { y: e.clientY, t: performance.now() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    // Yukarı çekişe direnç: lastik etkisi
    setDrag(dy > 0 ? dy : -Math.sqrt(-dy) * 2);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    const v = dy / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    if (dy > 120 || v > 0.6) close();
    setDrag(0);
  };

  if (!mounted) return null;
  return createPortal(
    <div className="sheet-root" data-closing={closing || undefined} data-noswipe>
      <button type="button" className="sheet-backdrop" aria-label="Kapat" onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="sheet-panel"
        style={drag ? { transform: `translate3d(0,${drag}px,0)`, transition: "none" } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div data-sheet-handle className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2.5">
          <span className="w-12" />
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
          <button type="button" onClick={close} className="w-12 text-right text-sm text-amber">
            Kapat
          </button>
        </div>
        <div data-sheet-body className="sheet-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
