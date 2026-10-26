"use client";

import { useEffect, useRef, useState } from "react";
import { DotLoader } from "./DotLoader";

type Appear = "intro" | "fade" | "none";
type Phase = "in" | "hold" | "leaving" | "lifting" | "gone";

const PLAYED_KEY = "pct-intro";
const INTRO_MS = 1500; // logo + alt yazı için en kısa süre
const QUICK_MS = 350; // intro zaten oynadıysa
const LEAVE_MS = 280; // yazının çekilmesi
const LIFT_MS = 760; // perdenin kalkması

function introPlayed() {
  try {
    return sessionStorage.getItem(PLAYED_KEY) === "1";
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    sessionStorage.setItem(PLAYED_KEY, "1");
  } catch {}
}

/**
 * Tam ekran açılış / yükleme perdesi.
 * - `done` false iken logo ve (gecikirse) yükleme göstergesi görünür.
 * - `done` true olunca yazı çekilir, kavisli perde yukarı kalkar ve bileşen kaybolur.
 * - Sekme oturumunda ilk kez açılıyorsa tam intro oynar; sonrakilerde doğrudan sabit görünür,
 *   böylece sayfalar arası geçişte (giriş → oyun) perde kesintisiz devam eder.
 */
export function Splash({
  done,
  status = "Genel merkeze bağlanılıyor",
  appear,
  onLift,
  error,
}: {
  done: boolean;
  status?: string;
  /** Yükleme başarısız olduysa: gösterge yerine hata ve "Tekrar dene" çıkar. */
  error?: string;
  appear?: Appear;
  /** Perde kalkmaya başladığında çağrılır; alttaki içeriğin giriş animasyonunu başlatmak için. */
  onLift?: () => void;
}) {
  const [mode, setMode] = useState<Appear | null>(appear ?? null);
  const [phase, setPhase] = useState<Phase>("in");
  const [slow, setSlow] = useState(false);
  const [minPassed, setMinPassed] = useState(false);
  const liftRef = useRef(onLift);
  liftRef.current = onLift;
  const decided = useRef<Appear | null>(null);

  // Görünüş biçimini istemcide belirle (sessionStorage SSR'da yok).
  // Ref, StrictMode'un efekti iki kez çalıştırmasında kararın değişmemesini sağlar.
  useEffect(() => {
    const m: Appear = decided.current ?? appear ?? (introPlayed() ? "none" : "intro");
    decided.current = m;
    setMode(m);
    if (m === "intro") markPlayed();
    const min = setTimeout(() => setMinPassed(true), m === "intro" ? INTRO_MS : QUICK_MS);
    const s = setTimeout(() => setSlow(true), m === "intro" ? INTRO_MS + 200 : 700);
    return () => {
      clearTimeout(min);
      clearTimeout(s);
    };
  }, [appear]);

  useEffect(() => {
    if (phase === "in" && mode) setPhase("hold");
  }, [mode, phase]);

  // Hazır + en kısa süre doldu → çıkış
  useEffect(() => {
    if (phase === "hold" && done && minPassed) setPhase("leaving");
  }, [phase, done, minPassed]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => {
      setPhase("lifting");
      liftRef.current?.();
    }, reduce ? 0 : LEAVE_MS);
    return () => clearTimeout(t1);
  }, [phase]);

  useEffect(() => {
    if (phase !== "lifting") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t2 = setTimeout(() => setPhase("gone"), reduce ? 300 : LIFT_MS);
    return () => clearTimeout(t2);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      className="splash"
      data-mode={mode ?? "pending"}
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "lifting"}
      aria-label="PCTopia yükleniyor"
    >
      <div className="splash-curtain">
        <svg className="splash-curve" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0V96C70 128 150 128 230 98C300 72 360 40 400 0Z" fill="#070D18" />
          <path d="M0 96C70 128 150 128 230 98C300 72 360 40 400 0" fill="none" stroke="#C9A24A" strokeOpacity=".8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="splash-content">
        <p className="splash-word">PCTOPIA</p>
        <p className="splash-tag">Bir garajda kur, holdinge dönüştür.</p>
        {error ? (
          <div className="splash-status" data-on="" role="alert">
            <span className="text-loss">{error}</span>
            <button type="button" className="text-amber underline-offset-4 hover:underline" onClick={() => window.location.reload()}>
              Tekrar dene
            </button>
          </div>
        ) : (
          <div className="splash-status" data-on={slow && !done ? "" : undefined}>
            <span className="splash-pill">
              <DotLoader />
            </span>
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
