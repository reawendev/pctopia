"use client";

import { useEffect, useRef } from "react";
import { RED } from "@/lib/game/casino";

// Avrupa çarkındaki sayı sırası (saat yönünde, sıfırdan başlayarak)
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SLOT = 360 / WHEEL_ORDER.length;

/** Çarkın dönüş süresi; sonuç bu süre bitince gösterilir. */
export const SPIN_MS = 5200;

const C = 100; // merkez
const R_RIM = 98;
const R_TRACK = 86; // topun döndüğü oluk
const R_POCKET_OUT = 76;
const R_POCKET_IN = 56;
const R_BALL_REST = 49; // cepte topun durduğu yarıçap (sayının hemen altındaki bölme)
const R_CONE = 40;

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180; // 0° tepede
const pt = (r: number, deg: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;

function wedge(i: number): string {
  const a0 = i * SLOT - SLOT / 2;
  const a1 = i * SLOT + SLOT / 2;
  const [x0, y0] = pt(R_POCKET_OUT, a0);
  const [x1, y1] = pt(R_POCKET_OUT, a1);
  const [x2, y2] = pt(R_POCKET_IN, a1);
  const [x3, y3] = pt(R_POCKET_IN, a0);
  return `M${x0} ${y0} A${R_POCKET_OUT} ${R_POCKET_OUT} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R_POCKET_IN} ${R_POCKET_IN} 0 0 0 ${x3} ${y3}Z`;
}

const fill = (n: number) => (n === 0 ? "#2F7A4B" : RED.has(n) ? "#A8322A" : "#121B29");
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const mod = (x: number, m: number) => ((x % m) + m) % m;

/**
 * Yuvarlak rulet çarkı. `spin` değişince (yeni id) çark saat yönünde, top ters yönde döner;
 * top yavaşlayıp oluktan cebe düşer, biraz sekip `spin.n` cebine oturur. Bitince onDone çağrılır.
 * Animasyon DOM'a doğrudan yazılır (her karede React render'ı olmasın).
 */
export function RouletteWheel({ spin, onDone, size = 220 }: { spin: { id: number; n: number } | null; onDone?: () => void; size?: number }) {
  const wheelRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const shadowRef = useRef<SVGCircleElement>(null);
  const pos = useRef({ wheel: 0, ball: 0, r: R_TRACK, visible: false });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  function paint(wheel: number, ball: number, r: number, visible: boolean) {
    pos.current = { wheel, ball, r, visible };
    wheelRef.current?.setAttribute("transform", `rotate(${wheel} ${C} ${C})`);
    const [x, y] = pt(r, ball);
    for (const el of [ballRef.current, shadowRef.current]) {
      if (!el) continue;
      el.setAttribute("cx", String(el === shadowRef.current ? x + 0.8 : x));
      el.setAttribute("cy", String(el === shadowRef.current ? y + 1.2 : y));
      el.style.opacity = visible ? "1" : "0";
    }
  }

  // Boştayken (dönüş yokken) çark yavaşça döner; cepteki top da onunla birlikte
  const spinning = useRef(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      if (!spinning.current) {
        const p = pos.current;
        paint(p.wheel + dt * 0.006, p.visible ? p.ball + dt * 0.006 : p.ball, p.r, p.visible);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!spin) return;
    const idx = WHEEL_ORDER.indexOf(spin.n);
    if (idx < 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w0 = pos.current.wheel;
    const w1 = w0 + 360 * 2 + Math.random() * 360; // çark 2-3 tur
    // Topun duracağı mutlak açı: çarkın son açısı + cebin çark üzerindeki açısı
    const target = w1 + idx * SLOT;
    const b0 = mod(pos.current.ball + 120 + Math.random() * 120, 360);
    // Top ters yönde (azalan açı) 5-6 tur atıp hedefe varır
    const travel = 360 * 5 + mod(b0 - target, 360);
    if (reduce) {
      paint(w1, target, R_BALL_REST, true);
      doneRef.current?.();
      return;
    }
    let raf = 0;
    spinning.current = true;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / SPIN_MS));
      const wheel = w0 + (w1 - w0) * easeOutCubic(t);
      const ball = b0 - travel * easeOutQuart(t);
      // Yarıçap: %55'e kadar olukta, sonra cebe süzülür; düşerken iki kez seker
      let r = R_TRACK;
      if (t > 0.55) {
        const k = Math.min(1, (t - 0.55) / 0.3);
        r = R_TRACK - (R_TRACK - R_BALL_REST) * easeOutCubic(k);
        if (k > 0.35) {
          const b = (k - 0.35) / 0.65;
          r += Math.abs(Math.sin(b * Math.PI * 2.5)) * 5 * (1 - b);
        }
      }
      paint(wheel, ball, r, true);
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        spinning.current = false;
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      spinning.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin?.id]);

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="block select-none" role="img" aria-label={spin ? `Rulet çarkı, top ${spin.n} cebinde` : "Rulet çarkı"}>
      <defs>
        <radialGradient id="rw-wood" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#5A3A22" />
          <stop offset="100%" stopColor="#2B1B10" />
        </radialGradient>
        <radialGradient id="rw-cone" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#E3C987" />
          <stop offset="55%" stopColor="#C9A24A" />
          <stop offset="100%" stopColor="#7A5F24" />
        </radialGradient>
        <radialGradient id="rw-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#E7E2D6" />
          <stop offset="100%" stopColor="#A9A396" />
        </radialGradient>
      </defs>

      {/* Sabit gövde ve top oluğu */}
      <circle cx={C} cy={C} r={R_RIM} fill="url(#rw-wood)" stroke="#C9A24A" strokeWidth="1.5" />
      <circle cx={C} cy={C} r={R_TRACK + 5} fill="#1A120B" stroke="#3B2A1A" strokeWidth="1" />
      <circle cx={C} cy={C} r={R_TRACK - 4} fill="none" stroke="#C9A24A" strokeOpacity="0.35" strokeWidth="0.6" />

      {/* Dönen çark */}
      <g ref={wheelRef}>
        <circle cx={C} cy={C} r={R_POCKET_OUT + 1.5} fill="#C9A24A" />
        {WHEEL_ORDER.map((n, i) => {
          const [tx, ty] = pt((R_POCKET_OUT + R_POCKET_IN) / 2 + 4, i * SLOT);
          return (
            <g key={n}>
              <path d={wedge(i)} fill={fill(n)} stroke="#C9A24A" strokeWidth="0.5" />
              <text x={tx} y={ty} fill="#EDE6D6" fontSize="6.2" fontWeight="600" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * SLOT} ${tx} ${ty})`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {n}
              </text>
            </g>
          );
        })}
        {/* Cep bölmeleri (topun oturduğu halka) */}
        <circle cx={C} cy={C} r={R_POCKET_IN} fill="#0E1828" stroke="#C9A24A" strokeWidth="0.8" />
        {WHEEL_ORDER.map((_, i) => {
          const [x0, y0] = pt(R_POCKET_IN, i * SLOT + SLOT / 2);
          const [x1, y1] = pt(R_CONE + 2, i * SLOT + SLOT / 2);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#C9A24A" strokeOpacity="0.55" strokeWidth="0.5" />;
        })}
        <circle cx={C} cy={C} r={R_CONE} fill="url(#rw-cone)" stroke="#7A5F24" strokeWidth="0.8" />
        {/* Taret */}
        {[0, 90, 180, 270].map((a) => {
          const [x, y] = pt(22, a);
          return <line key={a} x1={C} y1={C} x2={x} y2={y} stroke="#7A5F24" strokeWidth="2.4" strokeLinecap="round" />;
        })}
        <circle cx={C} cy={C} r="6" fill="#E3C987" stroke="#7A5F24" strokeWidth="1" />
      </g>

      {/* Top */}
      <circle ref={shadowRef} r="3.4" fill="#000" fillOpacity="0.45" style={{ filter: "blur(0.6px)", opacity: 0 }} />
      <circle ref={ballRef} r="3.4" fill="url(#rw-ball)" style={{ opacity: 0 }} />
    </svg>
  );
}
