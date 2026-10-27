"use client";

import { useEffect, useRef, useState } from "react";
import { PLINKO_MULTS, PLINKO_ROWS, type PlinkoRisk } from "@/lib/game/casino";

const W = 300;
const GAP = 21; // çiviler arası yatay mesafe
const ROW_H = 19;
const TOP = 22;
const BIN_Y = TOP + PLINKO_ROWS * ROW_H + 10;
const HEIGHT = BIN_Y + 30;
const STEP_MS = 135; // bir sıradan diğerine düşüş
export const PLINKO_MS = (PLINKO_ROWS + 1) * STEP_MS + 260;

// Sıra r'deki (0'dan) çivilerin x konumları: r+3 çivi, ortalanmış
const pegX = (r: number, j: number) => W / 2 + (j - (r + 2) / 2) * GAP;
const pegY = (r: number) => TOP + r * ROW_H;
// r sıra geçtikten sonra (i kez sağa) topun x konumu: iki çivinin arası
const ballX = (r: number, i: number) => W / 2 + (i - r / 2) * GAP;

function binColor(m: number): string {
  if (m >= 20) return "#C2281E";
  if (m >= 5) return "#D9622B";
  if (m >= 1.5) return "#C9A24A";
  if (m >= 1) return "#6E8F5A";
  return "#3E5372";
}

/**
 * Plinko tahtası. `drop` gelince top tepeden bırakılır, her sırada sunucunun belirlediği yöne (path) seker,
 * sonunda kutusuna düşer; kutu zıplar. Animasyon DOM'a doğrudan yazılır.
 */
export function PlinkoBoard({ drop, risk, onDone }: { drop: { id: number; path: number[]; bin: number } | null; risk: PlinkoRisk; onDone?: () => void }) {
  const ballRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPolylineElement>(null);
  const [hitPegs, setHitPegs] = useState<Set<string>>(new Set());
  const [landed, setLanded] = useState<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const mults = PLINKO_MULTS[risk];

  useEffect(() => {
    if (!drop) return;
    setLanded(null);
    setHitPegs(new Set());
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Durak noktaları: tepe, her sıradaki çivinin üstü, kutu
    const pts: [number, number][] = [[W / 2, TOP - 16]];
    let i = 0;
    for (let r = 0; r < PLINKO_ROWS; r++) {
      pts.push([ballX(r, i), pegY(r) - 6]);
      i += drop.path[r] ? 1 : 0;
    }
    pts.push([ballX(PLINKO_ROWS, i), BIN_Y + 4]);
    const ball = ballRef.current!;
    const place = (x: number, y: number) => {
      ball.setAttribute("cx", String(x));
      ball.setAttribute("cy", String(y));
    };
    if (reduce) {
      place(...pts[pts.length - 1]);
      ball.style.opacity = "1";
      setLanded(drop.bin);
      doneRef.current?.();
      return;
    }
    ball.style.opacity = "1";
    const trail: string[] = [];
    let raf = 0;
    let lastSeg = -1;
    const start = performance.now();
    const frame = (now: number) => {
      // İlk karenin zaman damgası başlangıçtan önce olabilir
      const t = Math.max(0, (now - start) / STEP_MS);
      const seg = Math.min(pts.length - 2, Math.floor(t));
      const k = Math.min(1, t - seg);
      const [x0, y0] = pts[seg];
      const [x1, y1] = pts[seg + 1];
      // Çividen sekme: yatayda doğrusal, dikeyde önce hafif yukarı sonra aşağı (yerçekimi)
      const x = x0 + (x1 - x0) * k;
      const hop = seg === 0 ? 0 : 7 * Math.sin(Math.PI * k) * (1 - k * 0.4);
      const y = y0 + (y1 - y0) * k * k - hop;
      place(x, y);
      if (seg !== lastSeg) {
        lastSeg = seg;
        if (seg >= 1 && seg <= PLINKO_ROWS) {
          // Çarptığı çivi: topun altındaki
          let ri = 0;
          for (let r = 0; r < seg - 1; r++) ri += drop.path[r] ? 1 : 0;
          const key = `${seg - 1}:${ri + 1}`;
          setHitPegs((s) => new Set(s).add(key));
        }
        trail.push(`${x0},${y0}`);
        trailRef.current?.setAttribute("points", trail.join(" "));
      }
      if (t < pts.length - 1) raf = requestAnimationFrame(frame);
      else {
        place(...pts[pts.length - 1]);
        setLanded(drop.bin);
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.id]);

  const binW = GAP - 2;
  return (
    <svg viewBox={`0 0 ${W} ${HEIGHT}`} className="mx-auto block w-full max-w-[340px] select-none" role="img" aria-label={landed !== null ? `Top ×${mults[landed]} kutusuna düştü` : "Plinko tahtası"}>
      <defs>
        <radialGradient id="pk-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF6D6" />
          <stop offset="60%" stopColor="#E3C987" />
          <stop offset="100%" stopColor="#A48231" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={HEIGHT} rx="10" fill="#0E1828" />
      <polyline ref={trailRef} fill="none" stroke="#C9A24A" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="2 3" />
      {Array.from({ length: PLINKO_ROWS }, (_, r) =>
        Array.from({ length: r + 3 }, (_, j) => {
          const hit = hitPegs.has(`${r}:${j}`);
          return <circle key={`${r}:${j}`} cx={pegX(r, j)} cy={pegY(r)} r={hit ? 2.8 : 2.2} fill={hit ? "#FFE27A" : "#93A1B5"} className={hit ? "plinko-peg-hit" : undefined} />;
        })
      )}
      {mults.map((m, k) => {
        const x = ballX(PLINKO_ROWS, k);
        const on = landed === k;
        return (
          <g key={k} className={on ? "plinko-bin-hit" : undefined} style={{ transformOrigin: `${x}px ${BIN_Y + 12}px` }}>
            <rect x={x - binW / 2} y={BIN_Y} width={binW} height={20} rx="3" fill={binColor(m)} opacity={landed === null || on ? 1 : 0.55} />
            <text x={x} y={BIN_Y + 10.5} textAnchor="middle" dominantBaseline="central" fill="#EDE6D6" fontSize={m >= 100 ? 6 : 6.8} fontWeight="700">
              {m >= 10 ? Math.round(m) : m.toLocaleString("tr-TR")}
            </text>
          </g>
        );
      })}
      <circle ref={ballRef} cx={W / 2} cy={TOP - 16} r="5" fill="url(#pk-ball)" style={{ opacity: 0 }} />
    </svg>
  );
}
