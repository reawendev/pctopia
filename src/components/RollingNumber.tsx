"use client";

import { useEffect, useRef, useState } from "react";

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Değeri bir anda değiştirmek yerine yeni değere yuvarlanarak giden sayı.
 * - `flash`: artışta yeşil, azalışta kırmızı kısa parlama
 * - `delta`: değişim miktarı küçük bir etiket olarak yükselip söner (+$1.200)
 * Sayılar `tabular-nums` ile yazılır, genişlik zıplamaz.
 */
export function RollingNumber({
  value,
  format,
  className = "",
  duration = 700,
  flash = false,
  delta = false,
  minDelta = 1,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  flash?: boolean;
  delta?: boolean;
  /** Bu tutardan küçük değişimlerde parlama/etiket yok (saniyelik birikim gibi). */
  minDelta?: number;
}) {
  const [shown, setShown] = useState(value);
  const [pulse, setPulse] = useState<{ dir: "up" | "down"; amount: number; key: number } | null>(null);
  const from = useRef(value);
  const current = useRef(value);
  const raf = useRef<number>();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      from.current = value;
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    const diff = value - start;
    if (diff === 0) return;

    if ((flash || delta) && Math.abs(diff) >= minDelta) {
      setPulse({ dir: diff > 0 ? "up" : "down", amount: diff, key: Date.now() });
    }

    if (reducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }

    const t0 = performance.now();
    cancelAnimationFrame(raf.current!);
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const v = start + diff * easeOutExpo(p);
      current.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current!);
  }, [value, duration, flash, delta, minDelta]);

  // Parlama bitince temizle
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(null), 1400);
    return () => clearTimeout(t);
  }, [pulse]);

  return (
    <span className="relative inline-block">
      <span key={flash && pulse ? `v${pulse.key}` : "v"} className={`num ${className} ${flash && pulse ? (pulse.dir === "up" ? "flash-gain" : "flash-loss") : ""}`}>
        {format(shown)}
      </span>
      {delta && pulse && (
        <span key={`d${pulse.key}`} aria-hidden className={`delta-float num ${pulse.dir === "up" ? "text-gain" : "text-loss"}`}>
          {pulse.dir === "up" ? "+" : "−"}
          {format(Math.abs(pulse.amount))}
        </span>
      )}
    </span>
  );
}
