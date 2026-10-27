"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SLOT_SYMBOLS, type SlotSymbol } from "@/lib/game/casino";

const H = 64; // bir sembolün yüksekliği (px)
const STOPS = [1300, 1800, 2350]; // makaraların durma anları
export const SLOT_MS = STOPS[2] + 250;

// ---------------- Semboller (SVG) ----------------

export function Symbol({ s, size = 44 }: { s: SlotSymbol; size?: number }) {
  const v = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true } as const;
  switch (s) {
    case "seven":
      return (
        <svg {...v}>
          <path d="M10 9h28v6L24 40h-9l13-23H10z" fill="#C2281E" stroke="#7A120C" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13 11h22" stroke="#FF8A7A" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...v}>
          <path d="M8 18l7-9h18l7 9-16 22z" fill="#5BA8F0" stroke="#1E4E86" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 18h32M15 9l9 31M33 9l-9 31M15 9l4 9M33 9l-4 9" stroke="#1E4E86" strokeWidth="1.2" fill="none" />
          <path d="M17 11l-4 6" stroke="#D9EEFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "bell":
      return (
        <svg {...v}>
          <path d="M24 6c-7 0-11 6-11 13v8l-4 6h30l-4-6v-8c0-7-4-13-11-13z" fill="#E8B92E" stroke="#8A6312" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="24" cy="38" r="4" fill="#8A6312" />
          <path d="M17 14c1-3 3-4 5-5" stroke="#FFF1B8" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "bar":
      return (
        <svg {...v}>
          <rect x="5" y="15" width="38" height="18" rx="3" fill="#16233A" stroke="#C9A24A" strokeWidth="2" />
          <text x="24" y="24.5" textAnchor="middle" dominantBaseline="central" fill="#E3C987" fontSize="12" fontWeight="900" style={{ letterSpacing: "0.06em" }}>
            BAR
          </text>
        </svg>
      );
    case "cherry":
      return (
        <svg {...v}>
          <path d="M16 30c2-9 7-17 16-22M32 30c-1-8 0-15 0-22" stroke="#3E7A2A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M32 8c4-1 8 1 9 4-4 1-7 0-9-4z" fill="#5BA33A" />
          <circle cx="15" cy="33" r="8" fill="#C4202A" stroke="#6E0E14" strokeWidth="1.6" />
          <circle cx="32" cy="34" r="8" fill="#D62A33" stroke="#6E0E14" strokeWidth="1.6" />
          <circle cx="12" cy="30" r="2" fill="#FF9AA0" />
          <circle cx="29" cy="31" r="2" fill="#FF9AA0" />
        </svg>
      );
    case "lemon":
      return (
        <svg {...v}>
          <ellipse cx="24" cy="25" rx="16" ry="11" transform="rotate(-20 24 25)" fill="#F2D43A" stroke="#9A7E0C" strokeWidth="2" />
          <path d="M9 31l-3 2M39 19l3-2" stroke="#9A7E0C" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M16 21c3-3 7-4 10-4" stroke="#FFF6B8" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}

const rnd = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];

// ---------------- Makara ----------------

/**
 * Makara bir semboller şeridi. Dönüşte şerit aşağı akar: eski üç sembol alttan çıkar, araya rastgele
 * semboller girer, en üstte yeni üçlü (orta satır sonuç) durur. Sona doğru hafifçe geri yaylanır.
 */
function Reel({ result, spinId, stopAt, onStop }: { result: SlotSymbol; spinId: number; stopAt: number; onStop: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  // Başlangıç sabit: sunucu ve tarayıcı aynı şeyi çizsin
  const [strip, setStrip] = useState<SlotSymbol[]>(() => ["lemon", result, "bar"]);
  const shown = useRef<SlotSymbol[]>(strip);
  const pending = useRef(false);
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  // 1) Yeni dönüş: şeridi kur (üstte yeni üçlü, altta görünen eski üçlü)
  useEffect(() => {
    if (!spinId) return;
    const filler = Array.from({ length: 14 + Math.round(stopAt / 120) }, rnd);
    const next: SlotSymbol[] = [rnd(), result, rnd(), ...filler, ...shown.current];
    shown.current = next.slice(0, 3);
    pending.current = true;
    setStrip(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  // 2) Şerit ekrana çizilince, boyamadan önce: eski üçlüden başlat ve aşağı akıt
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const el = stripRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.style.transition = "none";
    el.style.filter = "none";
    el.style.transform = `translateY(${-(strip.length - 3) * H}px)`;
    if (reduce) {
      el.style.transform = "translateY(0)";
      const t = setTimeout(() => stopRef.current(), 0);
      return () => clearTimeout(t);
    }
    void el.offsetHeight; // başlangıç konumu uygulansın
    el.style.transition = `transform ${stopAt}ms cubic-bezier(0.25, 0.1, 0.2, 1.06)`;
    el.style.transform = "translateY(0)";
    el.style.filter = "blur(1.6px)"; // hızlıyken bulanık
    const unblur = setTimeout(() => (el.style.filter = "none"), stopAt * 0.72);
    const stop = setTimeout(() => stopRef.current(), stopAt);
    return () => {
      clearTimeout(unblur);
      clearTimeout(stop);
    };
  }, [strip, stopAt]);

  return (
    <div className="relative overflow-hidden rounded-[6px] bg-[linear-gradient(180deg,#B9B4A8_0%,#FBF8F1_22%,#FFFFFF_50%,#FBF8F1_78%,#B9B4A8_100%)]" style={{ height: H * 2.3, width: 64 }}>
      <div ref={stripRef} className="absolute inset-x-0 top-0" style={{ marginTop: -H * 0.35, willChange: "transform" }}>
        {strip.map((s, i) => (
          <div key={i} className="flex items-center justify-center" style={{ height: H }}>
            <Symbol s={s} />
          </div>
        ))}
      </div>
      {/* Cam: üst ve alt gölge */}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),transparent_28%,transparent_72%,rgba(0,0,0,0.28))]" aria-hidden />
    </div>
  );
}

// ---------------- Makine ----------------

/**
 * Altın gövdeli üç makaralı slot makinesi. `spin` değişince kol inip kalkar, makaralar soldan sağa sırayla
 * durur, sonra onDone. Kazançta lambalar yanıp söner ve kazanç çizgisi parlar.
 */
export function SlotMachine({
  spin,
  onDone,
  onPull,
  disabled,
  win,
}: {
  spin: { id: number; reels: SlotSymbol[] } | null;
  onDone?: () => void;
  onPull?: () => void;
  disabled?: boolean;
  win: number | null; // gösterilen sonucun çarpanı (null: dönüyor ya da henüz yok)
}) {
  const [running, setRunning] = useState(false);
  const [pulled, setPulled] = useState(false);
  const stopped = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reels = spin?.reels ?? (["seven", "seven", "seven"] as SlotSymbol[]);

  useEffect(() => {
    if (!spin) return;
    stopped.current = 0;
    setRunning(true);
    setPulled(true);
    const t = setTimeout(() => setPulled(false), 380);
    return () => clearTimeout(t);
  }, [spin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    stopped.current++;
    if (stopped.current === 3) {
      setRunning(false);
      doneRef.current?.();
    }
  };

  const lamps = running ? "slot-lamp-run" : win && win > 0 ? (win >= 75 ? "slot-lamp-jackpot" : "slot-lamp-win") : "";
  const big = win !== null && win >= 75;

  return (
    <div className="relative mx-auto w-[300px] max-w-full select-none" role="group" aria-label="Slot makinesi">
      <div className="flex items-end">
        {/* Gövde */}
        <div className="relative w-[256px] rounded-t-[28px] rounded-b-[10px] bg-[linear-gradient(160deg,#F6DA7A_0%,#D9A92F_30%,#B07F14_62%,#E7C150_100%)] p-[10px] shadow-[inset_0_2px_0_rgba(255,255,255,0.55),inset_0_-3px_0_rgba(0,0,0,0.25),0_10px_24px_-10px_rgba(0,0,0,0.7)]">
          {/* Lambalar */}
          <div className="mb-2 flex justify-center gap-6 pt-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`block h-4 w-6 rounded-t-full border border-[#7A120C] bg-[radial-gradient(circle_at_50%_70%,#FF7A6A,#C2281E_70%)] ${lamps}`}
                style={{ animationDelay: `${i * 120}ms`, boxShadow: lamps ? undefined : "inset 0 -2px 0 rgba(0,0,0,0.25)" }}
              />
            ))}
          </div>
          {/* Makara penceresi */}
          <div className="relative rounded-[12px] bg-[linear-gradient(180deg,#8A6312,#5E420A)] p-[6px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
            <div className="flex justify-between gap-[6px]">
              {reels.map((r, i) => (
                <Reel key={i} result={r} spinId={spin?.id ?? 0} stopAt={STOPS[i]} onStop={stop} />
              ))}
            </div>
            {/* Kazanç çizgisi */}
            <span className={`pointer-events-none absolute inset-x-[6px] top-1/2 h-[2px] -translate-y-1/2 ${win && win > 0 && !running ? "slot-line-win" : "bg-[#C2281E]/45"}`} aria-hidden />
          </div>
          {/* Düğmeler */}
          <div className="mt-2 flex justify-center gap-5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-2.5 w-8 rounded-full bg-[radial-gradient(circle_at_50%_30%,#FF7A6A,#A11A12)] shadow-[0_2px_0_#5A0A06]" />
            ))}
          </div>
          {/* SPIN plakası */}
          <div className="mx-auto mt-2 w-[150px] rounded-md bg-[linear-gradient(180deg,#FBEAA8,#D9A92F)] py-0.5 text-center font-display text-lg font-extrabold tracking-[0.12em] text-[#C2281E] [text-shadow:0_1px_0_#7A120C] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_0_rgba(0,0,0,0.3)]">
            SPIN
          </div>
        </div>

        {/* Kol */}
        <button
          type="button"
          onClick={onPull}
          disabled={disabled || running}
          aria-label="Kolu çek"
          className="group relative -ml-1 mb-[86px] h-[150px] w-[40px] disabled:cursor-not-allowed"
        >
          <span className="absolute bottom-0 left-0 h-[34px] w-[18px] rounded-r-md bg-[linear-gradient(90deg,#8A6312,#E7C150,#8A6312)]" />
          <span
            className={`absolute bottom-[24px] left-[10px] block w-[6px] origin-bottom rounded-full bg-[linear-gradient(90deg,#9A9A9A,#F2F2F2,#8A8A8A)] transition-transform duration-300 ease-out ${pulled ? "scale-y-[-0.55]" : ""}`}
            style={{ height: 110 }}
          >
            <span className="absolute -left-[7px] -top-[10px] block h-5 w-5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#FF8A7A,#C2281E_60%,#7A120C)] shadow-[0_2px_3px_rgba(0,0,0,0.4)] group-enabled:group-hover:brightness-110" />
          </span>
        </button>
      </div>
      {/* Ayak */}
      <div className="mx-auto mt-[-2px] h-3 w-[200px] translate-x-[-22px] rounded-b-xl bg-[linear-gradient(180deg,#B07F14,#6E4E0C)]" />
      {big && !running && (
        <div className="slot-jackpot pointer-events-none absolute inset-x-0 top-[38%] text-center font-display text-3xl font-extrabold text-[#FFE27A] [text-shadow:0_2px_0_#7A120C,0_0_18px_rgba(255,200,60,0.8)]">
          {win! >= 250 ? "JACKPOT!" : "BÜYÜK KAZANÇ!"}
        </div>
      )}
    </div>
  );
}
