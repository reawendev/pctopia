"use client";

import { useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/game/market";

type Pt = { t: number; p: number };

const W = 420;
const H = 210;
const PAD = { l: 6, r: 58, t: 10, b: 22 };

function timeLabel(t: number, range: string) {
  const d = new Date(t);
  if (range === "1g") {
    const hm = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? hm : "Dün " + hm;
  }
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) + (range === "1h" ? " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "");
}

export function PriceChart({ points, range }: { points: Pt[]; range: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const ps = points.map((x) => x.p);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    lo -= pad;
    hi += pad;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (i / (points.length - 1)) * iw;
    const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * ih;
    const line = points.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt.p).toFixed(1)}`).join("");
    const area = `${line}L${x(points.length - 1).toFixed(1)},${H - PAD.b}L${PAD.l},${H - PAD.b}Z`;
    const ticks = [0, 0.5, 1].map((f) => lo + pad + f * (hi - lo - 2 * pad));
    return { x, y, line, area, ticks, up: points[points.length - 1].p >= points[0].p };
  }, [points]);

  if (!geo) return <div className="flex h-[220px] items-center justify-center text-sm text-mute">Veri yükleniyor…</div>;

  const color = geo.up ? "#4ade80" : "#f87171";
  const gid = geo.up ? "g-up" : "g-down";
  const h = hover !== null ? points[hover] : null;

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none select-none"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="Fiyat grafiği"
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geo.ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="#222d3b" strokeDasharray="3 4" />
          <text x={W - PAD.r + 6} y={geo.y(v) + 4} fill="#8593a6" fontSize="13" fontFamily="IBM Plex Sans, sans-serif">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      <text x={PAD.l} y={H - 5} fill="#8593a6" fontSize="13">{timeLabel(points[0].t, range)}</text>
      <text x={W - PAD.r} y={H - 5} fill="#8593a6" fontSize="13" textAnchor="end">{timeLabel(points[points.length - 1].t, range)}</text>
      <path d={geo.area} fill={`url(#${gid})`} />
      <path d={geo.line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {h && hover !== null && (
        <g>
          <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#8593a6" strokeWidth="1" />
          <circle cx={geo.x(hover)} cy={geo.y(h.p)} r="4" fill={color} stroke="#0a0e13" strokeWidth="2" />
          <g transform={`translate(${Math.min(geo.x(hover) + 8, W - PAD.r - 136)},${PAD.t})`}>
            <rect width="130" height="42" rx="4" fill="#161e29" stroke="#222d3b" />
            <text x="8" y="18" fill="#e6ebf2" fontSize="14" fontFamily="IBM Plex Sans, sans-serif">{formatPrice(h.p)}</text>
            <text x="8" y="34" fill="#8593a6" fontSize="12">{timeLabel(h.t, range === "1g" ? "1g" : "1h")}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

export function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 80).toFixed(1)},${(2 + (1 - (v - lo) / span) * 24).toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 80 28" width="80" height="28" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "#4ade80" : "#f87171"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
