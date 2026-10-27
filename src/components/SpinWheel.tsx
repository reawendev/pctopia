"use client";

import { useEffect, useRef } from "react";
import { SPIN_SEGMENTS } from "@/lib/game/casino";

export const SPIN_WHEEL_MS = 4600;

const N = SPIN_SEGMENTS.length;
const SEG = 360 / N;
const C = 100;
const R = 92;

// Çarpana göre dilim rengi
function color(m: number): string {
  if (m === 0) return "#1B2C44";
  if (m < 1) return "#3E5372";
  if (m < 2) return "#2F7A4B";
  if (m < 3) return "#7EA6E0";
  if (m < 10) return "#C98BC9";
  return "#C9A24A";
}
const ink = (m: number) => (m >= 2 && m < 10) || m >= 10 ? "#0E1828" : "#EDE6D6";
export const label = (m: number) => (m === 0 ? "BOŞ" : `×${m.toLocaleString("tr-TR")}`);

const pt = (r: number, deg: number) => [C + r * Math.cos(((deg - 90) * Math.PI) / 180), C + r * Math.sin(((deg - 90) * Math.PI) / 180)] as const;
function slice(i: number) {
  const [x0, y0] = pt(R, i * SEG - SEG / 2);
  const [x1, y1] = pt(R, i * SEG + SEG / 2);
  return `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}Z`;
}

// Hızlı başlar, uzun süre yavaşlar, sonda hafifçe geri yaylanır
function ease(t: number) {
  const base = 1 - Math.pow(1 - t, 4);
  const settle = t > 0.9 ? Math.sin(((t - 0.9) / 0.1) * Math.PI) * 0.004 : 0;
  return base + settle;
}

/**
 * Şans çarkı: tepede sabit bir ibre, çark döner ve `spin.index` dilimi ibrenin altında durur.
 * İbre her dilim geçişinde tıklayarak sekiyor. Her karede React render'ı yok; dönüş DOM'a yazılır.
 */
export function SpinWheel({ spin, onDone, size = 240 }: { spin: { id: number; index: number } | null; onDone?: () => void; size?: number }) {
  const wheelRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!spin) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a0 = angle.current;
    // Dilim i ibrenin (0°) altına gelsin: çark açısı ≡ −i·SEG; dilim içinde biraz rastgele dur
    const jitter = (Math.random() - 0.5) * SEG * 0.6;
    const goal = -spin.index * SEG + jitter;
    const turns = 5 + Math.floor(Math.random() * 2);
    const a1 = a0 + turns * 360 + ((((goal - a0) % 360) + 360) % 360);
    const set = (a: number) => wheelRef.current?.setAttribute("transform", `rotate(${a} ${C} ${C})`);
    if (reduce) {
      angle.current = a1;
      set(a1);
      doneRef.current?.();
      return;
    }
    let raf = 0;
    let lastSeg = Math.floor((a0 + SEG / 2) / SEG);
    let kick = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / SPIN_WHEEL_MS));
      const a = a0 + (a1 - a0) * ease(t);
      angle.current = a;
      set(a);
      // İbre: dilim çizgisi geçtikçe geriye seker
      const seg = Math.floor((a + SEG / 2) / SEG);
      if (seg !== lastSeg) {
        lastSeg = seg;
        kick = 1;
      }
      kick *= 0.82;
      pointerRef.current?.setAttribute("transform", `rotate(${-kick * 18} ${C} 10)`);
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        pointerRef.current?.setAttribute("transform", "");
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin?.id]);

  return (
    <svg viewBox="0 0 200 206" width={size} height={size * 1.03} className="block select-none" role="img" aria-label={spin ? `Şans çarkı, ${label(SPIN_SEGMENTS[spin.index])}` : "Şans çarkı"}>
      <circle cx={C} cy={C + 2} r={R + 6} fill="#0A1220" />
      <circle cx={C} cy={C} r={R + 5} fill="#C9A24A" />
      <g ref={wheelRef}>
        {SPIN_SEGMENTS.map((m, i) => {
          const [tx, ty] = pt(R - 17, i * SEG);
          return (
            <g key={i}>
              <path d={slice(i)} fill={color(m)} stroke="#0E1828" strokeWidth="0.6" />
              <text
                x={tx}
                y={ty}
                fill={ink(m)}
                fontSize={m === 0 ? 5.6 : 7}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${i * SEG + 90} ${tx} ${ty})`}
                style={{ letterSpacing: m === 0 ? "0.04em" : undefined }}
              >
                {label(m)}
              </text>
            </g>
          );
        })}
        {/* Dilim uçlarında pirinç çiviler */}
        {SPIN_SEGMENTS.map((_, i) => {
          const [x, y] = pt(R + 1.5, i * SEG + SEG / 2);
          return <circle key={i} cx={x} cy={y} r="1.3" fill="#E3C987" />;
        })}
      </g>
      <circle cx={C} cy={C} r="20" fill="#142236" stroke="#C9A24A" strokeWidth="2" />
      <text x={C} y={C} fill="#E3C987" fontSize="8" fontWeight="800" textAnchor="middle" dominantBaseline="central" style={{ letterSpacing: "0.08em" }}>
        ÇARK
      </text>
      {/* İbre */}
      <g ref={pointerRef}>
        <path d={`M${C - 7} 2 L${C + 7} 2 L${C} 20 Z`} fill="#EDE6D6" stroke="#0E1828" strokeWidth="1" strokeLinejoin="round" />
        <circle cx={C} cy={6} r="2.2" fill="#C9A24A" />
      </g>
    </svg>
  );
}
