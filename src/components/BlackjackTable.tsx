"use client";

import { useRef } from "react";
import { RANKS, SUITS, type Card } from "@/lib/game/casino";
import { formatMoney } from "@/lib/game/economy";

export type BjHand = { bet: number; player: Card[]; dealer: Card[]; playerTotal: number; dealerTotal: number; canDouble: boolean };
export type BjOutcome = { net: number; text: string } | null;

export const DEAL_GAP = 260; // kartlar arası (ms)
export const FLIP_MS = 520; // kapalı kartın dönmesi

const CW = 46;
const CH = 66;

function Face({ c }: { c: Card }) {
  const red = c.s === 1 || c.s === 2;
  return (
    <span className={`absolute inset-0 rounded-[5px] border border-black/15 bg-[#FBF8F1] shadow-[0_2px_5px_rgba(0,0,0,0.45)] ${red ? "text-[#B0221A]" : "text-[#16233A]"}`} style={{ backfaceVisibility: "hidden" }}>
      <span className="absolute left-1 top-0.5 text-[11px] font-bold leading-tight">
        {RANKS[c.r]}
        <br />
        {SUITS[c.s]}
      </span>
      <span className="absolute inset-0 flex items-center justify-center text-2xl">{SUITS[c.s]}</span>
      <span className="absolute bottom-0.5 right-1 rotate-180 text-[11px] font-bold leading-tight">
        {RANKS[c.r]}
        <br />
        {SUITS[c.s]}
      </span>
    </span>
  );
}

function Back() {
  return (
    <span
      className="absolute inset-0 rounded-[5px] border border-[#C9A24A]/70 bg-[repeating-linear-gradient(45deg,#7A1E1A_0_4px,#94261F_4px_8px)] shadow-[0_2px_5px_rgba(0,0,0,0.45)]"
      style={{ backfaceVisibility: "hidden" }}
    >
      <span className="absolute inset-[4px] rounded-[3px] border border-[#E3C987]/60" />
    </span>
  );
}

/** Desteden uçarak gelen kart. `faceDown`: arkası görünür; `flipAt` verilirse o anda dönerek açılır. */
function PlayingCard({ c, delay, flipAt, faceDown }: { c?: Card; delay: number; flipAt?: number; faceDown?: boolean }) {
  const flipping = flipAt !== undefined && !!c;
  return (
    <span className="bj-deal relative block shrink-0" style={{ width: CW, height: CH, animationDelay: `${delay}ms`, perspective: 500 }}>
      <span
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          animation: flipping ? `bj-flip ${FLIP_MS}ms cubic-bezier(0.3, 0.7, 0.3, 1) ${flipAt}ms both` : undefined,
        }}
      >
        {c && !faceDown ? (
          flipping ? (
            <>
              {/* Dönüş: önce arka yüz, yarıda ön yüz */}
              <span className="absolute inset-0" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden", transformStyle: "preserve-3d" }}>
                <Face c={c} />
              </span>
              <Back />
            </>
          ) : (
            <Face c={c} />
          )
        ) : (
          <Back />
        )}
      </span>
    </span>
  );
}

function Chips({ amount, outcome, settled }: { amount: number; outcome: BjOutcome; settled: boolean }) {
  // Bahis büyüklüğüne göre 1-5 fiş
  const n = Math.max(1, Math.min(5, Math.round(Math.log10(Math.max(100, amount)) - 1)));
  const dir = settled && outcome ? (outcome.net > 0 ? "win" : outcome.net < 0 ? "lose" : "push") : "";
  return (
    <div className={`bj-chips ${dir ? `bj-chips-${dir}` : ""} relative h-8 w-8`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="absolute left-0 block h-8 w-8 rounded-full border-[3px] border-dashed border-white/80 bg-[#B0221A] shadow-[0_2px_0_#5A0A06]"
          style={{ bottom: i * 3, background: i % 2 ? "#16233A" : "#B0221A" }}
        />
      ))}
      {dir === "win" &&
        Array.from({ length: n }, (_, i) => (
          <span key={`w${i}`} className="bj-chip-pay absolute left-0 block h-8 w-8 rounded-full border-[3px] border-dashed border-white/80 bg-[#2F7A4B] shadow-[0_2px_0_#123A22]" style={{ bottom: (n + i) * 3, animationDelay: `${i * 70}ms` }} />
        ))}
    </div>
  );
}

/**
 * Yeşil çuhalı blackjack masası. Kartlar sağ üstteki kutudan sırayla gelir (oyuncu, krupiye, oyuncu, kapalı kart);
 * el bitince krupiyenin kapalı kartı döner, krupiye kart çeker, fişler kazanana kayar ve sonuç afişi çıkar.
 * Her kart ilk göründüğünde bir gecikme alır ve korur; saat ilerledikçe animasyon yeniden başlamaz.
 */
export function BlackjackTable({ hand, live, outcome, settled }: { hand: BjHand | null; live: boolean; outcome: BjOutcome; settled: boolean }) {
  const delays = useRef<Record<string, number>>({});
  const handKey = useRef<string | null>(null);

  if (!hand) {
    delays.current = {};
  } else {
    // Yeni el: her şey sıfırlanır
    const key = `${hand.bet}:${hand.player[0]?.r}${hand.player[0]?.s}:${hand.dealer[0]?.r}${hand.dealer[0]?.s}`;
    if (handKey.current !== key) {
      handKey.current = key;
      delays.current = {};
    }
    const d = delays.current;
    // Bu render'da eklenen kartlar, şu andan başlayarak sırayla
    let k = 0;
    const at = () => k++ * DEAL_GAP;
    const fresh = Object.keys(d).length === 0;
    for (let i = 0; i < Math.max(hand.player.length, 1); i++) {
      if (i < hand.player.length && d[`p${i}`] === undefined) d[`p${i}`] = at();
      if (i === 0 && hand.dealer.length && d.d0 === undefined) d.d0 = at();
      if (i === 1 && fresh && d.hole === undefined) d.hole = at();
    }
    if (d.hole === undefined) d.hole = at();
    // El bitti: kapalı kart döner, sonra krupiyenin ek kartları
    if (!live && hand.dealer.length > 1 && d.flip === undefined) {
      d.flip = k * DEAL_GAP + 150;
      k = Math.ceil((d.flip + FLIP_MS) / DEAL_GAP);
    }
    for (let i = 2; i < hand.dealer.length; i++) if (d[`d${i}`] === undefined) d[`d${i}`] = at();
  }

  const d = delays.current;
  const show = !!hand;
  return (
    <div className="relative overflow-hidden rounded-[14px] border-[6px] border-[#4A2E17] bg-[radial-gradient(ellipse_at_50%_20%,#2A6B47_0%,#1C4D33_55%,#123825_100%)] px-3 pb-9 pt-2 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
      {/* Masa yazısı: altta, kartlardan uzak */}
      <svg viewBox="0 0 300 34" className="pointer-events-none absolute bottom-1 left-1/2 w-[min(88%,380px)] -translate-x-1/2 opacity-50" aria-hidden>
        <path id="bj-arc" d="M15 6 Q150 40 285 6" fill="none" />
        <text fill="#E3C987" fontSize="7.5" fontWeight="700" letterSpacing="1.4">
          <textPath href="#bj-arc" startOffset="50%" textAnchor="middle">
            BLACKJACK 3'E 2 ÖDER · KRUPİYE 17'DE DURUR
          </textPath>
        </text>
      </svg>

      {/* Kart kutusu */}
      <div className="absolute right-2 top-2 h-[54px] w-[40px] rounded-[4px] bg-[#2B1B10] shadow-[2px_2px_0_#1A100A]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute rounded-[3px] border border-[#C9A24A]/60 bg-[repeating-linear-gradient(45deg,#7A1E1A_0_3px,#94261F_3px_6px)]" style={{ inset: 0, transform: `translate(${-3 - i * 1.5}px, ${3 + i}px)` }} />
        ))}
      </div>

      {/* Krupiye */}
      <div className="min-h-[96px]">
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/70">
          Krupiye
          {show && (!live || settled) && hand!.dealer.length > 1 && <span className="num ml-2 rounded bg-black/30 px-1.5 py-0.5 text-white">{hand!.dealerTotal}</span>}
        </div>
        <div className="mt-1 flex gap-1.5">
          {show && hand!.dealer[0] && <PlayingCard c={hand!.dealer[0]} delay={d.d0 ?? 0} />}
          {show && (live ? <PlayingCard faceDown delay={d.hole ?? 0} /> : hand!.dealer[1] ? <PlayingCard c={hand!.dealer[1]} delay={d.hole ?? 0} flipAt={d.flip} /> : null)}
          {show && hand!.dealer.slice(2).map((c, i) => <PlayingCard key={i + 2} c={c} delay={d[`d${i + 2}`] ?? 0} />)}
        </div>
      </div>

      {/* Bahis */}
      <div className="my-1 flex h-12 items-center justify-center gap-2">
        {show && (
          <>
            <Chips amount={hand!.bet} outcome={outcome} settled={settled} />
            <span className="num rounded bg-black/30 px-2 py-0.5 text-xs text-white">{formatMoney(hand!.bet)}</span>
          </>
        )}
      </div>

      {/* Oyuncu */}
      <div className="min-h-[96px]">
        <div className="mt-1 flex flex-wrap gap-1.5">{show && hand!.player.map((c, i) => <PlayingCard key={i} c={c} delay={d[`p${i}`] ?? 0} />)}</div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-white/70">
          Sen
          {show && <span className={`num ml-2 rounded px-1.5 py-0.5 ${hand!.playerTotal > 21 ? "bg-[#B0221A] text-white" : hand!.playerTotal === 21 ? "bg-[#C9A24A] text-ink" : "bg-black/30 text-white"}`}>{hand!.playerTotal}</span>}
        </div>
      </div>

      {/* Sonuç afişi */}
      {settled && outcome && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={`bj-banner rounded-md px-5 py-2 font-display text-lg font-extrabold sm:text-xl uppercase tracking-wide shadow-[0_6px_18px_rgba(0,0,0,0.5)] ${
              outcome.net > 0 ? "bg-[#C9A24A] text-[#16233A]" : outcome.net < 0 ? "bg-[#7A1E1A] text-[#F3EEE2]" : "bg-[#3E5372] text-white"
            }`}
          >
            {outcome.text}
          </span>
        </div>
      )}
    </div>
  );
}

/** Masadaki son kartın inip (ve kapalı kart döndüyse) sonucun görünür olacağı an (ms). */
export function tableSettleMs(before: { player: number; dealer: number; live: boolean }, after: BjHand, liveAfter: boolean): number {
  const newPlayer = Math.max(0, after.player.length - before.player);
  const fresh = before.player === 0;
  let k = newPlayer + (fresh ? 2 : 0); // ilk dağıtımda krupiyenin açık ve kapalı kartı
  if (!liveAfter && after.dealer.length > 1) {
    const flip = k * DEAL_GAP + 150;
    k = Math.ceil((flip + FLIP_MS) / DEAL_GAP) + Math.max(0, after.dealer.length - 2);
  }
  return k * DEAL_GAP + 300;
}
