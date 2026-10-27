import { useId } from "react";
import { eyewearOf, facialOf, TIE_COLORS, type CharacterSpec } from "@/lib/game/config";

// Kurucu portresi (SVG, 120×120). Katman sırası: arka plan, arka saç, gövde, boyun, kafa, yüz, yüz kılı,
// ön saç, gözlük, başlık, küpe. Eski kayıtlarda olmayan alanlar varsayılanla çizilir.

// ---------------- Renk yardımcıları ----------------

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
const darken = (c: string, t: number) => mix(c, "#000000", t);
const lighten = (c: string, t: number) => mix(c, "#ffffff", t);

// ---------------- Arka plan ----------------

function Backdrop({ kind, id }: { kind: string; id: string }) {
  switch (kind) {
    case "office":
      return (
        <g>
          <rect width="120" height="120" fill="#1b2433" />
          {/* pencere ve panjur */}
          <rect x="70" y="8" width="44" height="60" fill="#2c3d57" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x="70" y={10 + i * 8.4} width="44" height="3" fill="#1f2c40" />
          ))}
          <rect x="68" y="6" width="48" height="64" fill="none" stroke="#3a2a1a" strokeWidth="3" />
          {/* raf */}
          <rect x="4" y="30" width="30" height="3" fill="#4a3220" />
          <rect x="7" y="18" width="5" height="12" fill="#7c2d12" />
          <rect x="13" y="20" width="4" height="10" fill="#1e3a8a" />
          <rect x="18" y="17" width="6" height="13" fill="#a16207" />
          <rect x="0" y="96" width="120" height="24" fill="#141b26" />
        </g>
      );
    case "city":
      return (
        <g>
          <rect width="120" height="120" fill={`url(#${id}-sky)`} />
          {[
            [0, 52, 16],
            [14, 38, 14],
            [26, 60, 12],
            [36, 30, 16],
            [74, 44, 14],
            [86, 26, 16],
            [100, 50, 20],
          ].map(([x, y, w], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={120 - y} fill="#0b1220" />
              {Array.from({ length: Math.floor((120 - y) / 7) }, (_, r) =>
                Array.from({ length: Math.floor(w / 5) }, (_, c) =>
                  (r * 7 + c * 3 + i) % 4 === 0 ? <rect key={`${r}-${c}`} x={x + 1.5 + c * 5} y={y + 3 + r * 7} width="2" height="3" fill="#e3c987" opacity="0.75" /> : null
                )
              )}
            </g>
          ))}
        </g>
      );
    case "brass":
      return <rect width="120" height="120" fill={`url(#${id}-brass)`} />;
    case "teal":
      return <rect width="120" height="120" fill={`url(#${id}-teal)`} />;
    case "wine":
      return <rect width="120" height="120" fill={`url(#${id}-wine)`} />;
    default:
      return <rect width="120" height="120" fill="#161e29" />;
  }
}

// ---------------- Saç ----------------

/** Başın arkasında kalan saç (omuzlara inen kısım). */
function HairBack({ style, color }: { style: CharacterSpec["hair"]; color: string }) {
  const d = darken(color, 0.15);
  switch (style) {
    case "long":
      return <path d="M33 44c0-18 12-26 27-26s27 8 27 26v34c0 10-4 16-10 18l-34 0c-6-2-10-8-10-18z" fill={d} />;
    case "bob":
      return <path d="M34 44c0-17 11-25 26-25s26 8 26 25v22c0 6-3 9-7 10H41c-4-1-7-4-7-10z" fill={d} />;
    case "wavy":
      return <path d="M34 44c0-17 11-25 26-25s26 8 26 25v20c2 4 0 8-3 9 1 4-2 7-6 6H43c-4 1-7-2-6-6-3-1-5-5-3-9z" fill={d} />;
    case "afro":
      return <circle cx="60" cy="40" r="31" fill={d} />;
    case "ponytail":
      return <path d="M80 34c8 4 11 14 9 26-1 8-5 14-9 16 2-8 2-16-2-24z" fill={d} />;
    case "bun":
      return <circle cx="60" cy="15" r="9" fill={color} />;
    default:
      return null;
  }
}

/** Alnın üstündeki saç. Yüzün üstüne binmez; gözler hep açıkta. */
function HairFront({ style, color, senior }: { style: CharacterSpec["hair"]; color: string; senior: boolean }) {
  const hi = lighten(color, 0.18);
  const sheen = <path d="M48 26c5-3 12-4 18-2" stroke={hi} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.6" />;
  switch (style) {
    case "short":
      return (
        <g>
          <path d="M36 46c-2-17 9-26 24-26s26 9 24 26c-2-6-5-10-9-11-6 3-20 4-31 1-4 2-7 5-8 10z" fill={color} />
          {sheen}
        </g>
      );
    case "side":
      return (
        <g>
          <path d="M35 47c-3-18 9-28 25-28 16 0 27 9 25 28-2-8-6-12-11-14-10 1-17-1-23-5-5 4-12 9-16 19z" fill={color} />
          <path d="M51 28c4 4 11 6 20 6" stroke={darken(color, 0.25)} strokeWidth="1.2" fill="none" />
          {sheen}
        </g>
      );
    case "slick":
      return (
        <g>
          <path d="M36 44c-1-16 10-24 24-24s25 8 24 24c-3-7-8-11-14-12-7-1-14-1-21 1-6 2-10 5-13 11z" fill={color} />
          <path d="M44 28c6-4 16-5 26-2M42 32c8-3 18-4 30-1" stroke={hi} strokeWidth="1.2" fill="none" opacity="0.55" />
        </g>
      );
    case "undercut":
      return (
        <g>
          <path d="M37 48c0-4 0-8 1-11l2 13zM83 48c0-4 0-8-1-11l-2 13z" fill={color} opacity="0.45" />
          <path d="M39 38c-1-13 8-21 22-21 13 0 22 7 21 20-6-5-14-7-22-6-8 0-15 2-21 7z" fill={color} />
          {sheen}
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          {[
            [40, 36, 6],
            [46, 28, 6.5],
            [54, 23, 7],
            [63, 22, 7],
            [72, 25, 6.5],
            [79, 31, 6],
            [82, 39, 5],
            [38, 42, 4.5],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
          {[
            [48, 26],
            [60, 21],
            [72, 27],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill={hi} opacity="0.4" />
          ))}
        </g>
      );
    case "afro":
      return (
        <g fill={color}>
          <path d="M34 42c0-16 11-24 26-24s26 8 26 24c-6-8-15-10-26-10s-20 2-26 10z" />
          {[
            [38, 24],
            [52, 14],
            [68, 14],
            [82, 24],
            [86, 38],
            [34, 38],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" />
          ))}
        </g>
      );
    case "wavy":
      return (
        <g fill={color}>
          <path d="M35 47c-3-18 9-28 25-28s28 10 25 28c-2-5-5-9-9-11-3 3-8 4-12 2-3 3-9 4-13 2-4 1-8 4-10 7-2 1-4 2-6 0z" />
          {/* dalgalı yan tutamlar */}
          <path d="M35 44c-3 6-1 10-3 15 2 4 0 8-1 12l5 1c1-4 3-8 1-12 2-5 0-9 2-14z" />
          <path d="M85 44c3 6 1 10 3 15-2 4 0 8 1 12l-5 1c-1-4-3-8-1-12-2-5 0-9-2-14z" />
          <path d="M45 27c4-3 9-3 12 0M63 25c4-2 9-1 12 2" stroke={hi} strokeWidth="1.2" fill="none" opacity="0.55" />
        </g>
      );
    case "long":
      return (
        <g fill={color}>
          <path d="M35 48c-3-19 9-29 25-29s28 10 25 29c-3-8-9-12-16-13-3 3-8 5-14 5-6 0-11-2-14-4-3 3-5 7-6 12z" />
          {/* yüzü çerçeveleyen tutamlar */}
          <path d="M35 46c-1 12 0 26 4 38l-6-2c-3-12-3-26 2-36z" />
          <path d="M85 46c1 12 0 26-4 38l6-2c3-12 3-26-2-36z" />
          {sheen}
        </g>
      );
    case "bob":
      return (
        <g fill={color}>
          <path d="M35 50c-3-19 9-30 25-30s28 11 25 30l-2-10H37z" />
          <path d="M36 38h48v4H36z" />
          <path d="M35 44c-1 9 0 18 3 26l-5-1c-3-8-3-17 2-25zM85 44c1 9 0 18-3 26l5-1c3-8 3-17-2-25z" />
          {sheen}
        </g>
      );
    case "bun":
    case "ponytail":
      return (
        <g>
          <path d="M36 44c-1-16 10-24 24-24s25 8 24 24c-4-8-12-11-24-11s-20 3-24 11z" fill={color} />
          <path d="M46 26c4 2 10 3 14 2M60 28c4 1 10 0 14-3" stroke={darken(color, 0.25)} strokeWidth="1" fill="none" opacity="0.7" />
          {sheen}
        </g>
      );
    case "bald":
      // Kel: kıdemlide yanlarda kalan kır saç
      return senior ? (
        <g fill={color} opacity="0.9">
          <path d="M36 50c-1-6 0-10 2-13l2 13zM84 50c1-6 0-10-2-13l-2 13z" />
        </g>
      ) : null;
  }
}

// ---------------- Yüz ----------------

function Eyes({ kind, iris }: { kind: NonNullable<CharacterSpec["eyes"]>; iris: string }) {
  const one = (cx: number, flip: boolean) => {
    const cy = 50;
    const k = flip ? -1 : 1;
    switch (kind) {
      case "round":
        return (
          <g key={cx}>
            <ellipse cx={cx} cy={cy} rx="4.3" ry="3.6" fill="#fbfaf7" />
            <circle cx={cx} cy={cy + 0.2} r="2.4" fill={iris} />
            <circle cx={cx} cy={cy + 0.2} r="1.2" fill="#0b0f14" />
            <circle cx={cx + 0.9} cy={cy - 0.8} r="0.8" fill="#fff" />
          </g>
        );
      case "narrow":
        return (
          <g key={cx}>
            <path d={`M${cx - 4.6} ${cy}q4.6 -2.6 9.2 0q-4.6 2 -9.2 0z`} fill="#fbfaf7" />
            <circle cx={cx} cy={cy - 0.1} r="1.6" fill={iris} />
            <path d={`M${cx - 4.8} ${cy - 0.2}q4.8 -3 9.6 0`} stroke="#1c140f" strokeWidth="1.1" fill="none" />
          </g>
        );
      case "sleepy":
        return (
          <g key={cx}>
            <ellipse cx={cx} cy={cy + 0.4} rx="4.3" ry="2.9" fill="#fbfaf7" />
            <circle cx={cx} cy={cy + 0.8} r="2.2" fill={iris} />
            <circle cx={cx} cy={cy + 0.8} r="1.1" fill="#0b0f14" />
            {/* ağır göz kapağı */}
            <path d={`M${cx - 4.6} ${cy + 0.4}q4.6 -4.6 9.2 0v-3.6h-9.2z`} fill="currentColor" />
            <path d={`M${cx - 4.6} ${cy + 0.4}q4.6 -1.8 9.2 0`} stroke="#1c140f" strokeWidth="1" fill="none" />
          </g>
        );
      default: // badem
        return (
          <g key={cx}>
            <path d={`M${cx - 4.6} ${cy + 0.3}q${4.6 + k * 0.4} -4.4 9.2 -0.6q-4.2 3.6 -9.2 0.6z`} fill="#fbfaf7" />
            <circle cx={cx} cy={cy} r="2.2" fill={iris} />
            <circle cx={cx} cy={cy} r="1.1" fill="#0b0f14" />
            <circle cx={cx + 0.8} cy={cy - 0.8} r="0.7" fill="#fff" />
            <path d={`M${cx - 4.8} ${cy + 0.2}q${4.8 + k * 0.4} -4.8 9.6 -0.8`} stroke="#1c140f" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
        );
    }
  };
  return (
    <g>
      {one(50, false)}
      {one(70, true)}
    </g>
  );
}

function Brows({ kind, color }: { kind: NonNullable<CharacterSpec["brows"]>; color: string }) {
  const w = kind === "thick" ? 2.8 : kind === "straight" ? 1.9 : 1.7;
  const left =
    kind === "arched" ? "M44 44q6 -5 12 -1" : kind === "straight" ? "M44 43.5h11.5" : kind === "thick" ? "M44 44.5q6 -3 12 -1" : "M44.5 44q5.5 -3 11 -1";
  const right =
    kind === "arched" ? "M76 44q-6 -5 -12 -1" : kind === "straight" ? "M76 43.5h-11.5" : kind === "thick" ? "M76 44.5q-6 -3 -12 -1" : "M75.5 44q-5.5 -3 -11 -1";
  return (
    <g stroke={color} strokeWidth={w} fill="none" strokeLinecap="round">
      <path d={left} />
      <path d={right} />
    </g>
  );
}

function Mouth({ kind, woman, skin }: { kind: NonNullable<CharacterSpec["mouth"]>; woman: boolean; skin: string }) {
  const lip = woman ? "#a8424b" : darken(skin, 0.45);
  switch (kind) {
    case "grin":
      return (
        <g>
          <path d="M52.5 64.5q7.5 8 15 0z" fill="#5a1d1d" />
          <path d="M53.6 65.2h12.8l-.8 1.6h-11.2z" fill="#fbfaf7" />
          <path d="M52.5 64.5q7.5 8 15 0" stroke={lip} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </g>
      );
    case "neutral":
      return (
        <g>
          {woman && <path d="M54 66.5q6 2.6 12 0q-6 -1.4 -12 0z" fill={lip} />}
          <path d="M54 66.5h12" stroke={darken(skin, 0.55)} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    case "smirk":
      return (
        <g>
          {woman && <path d="M54 67q7 2.4 13 -2.6q-6 0.6 -13 2.6z" fill={lip} />}
          <path d="M54 67q7 1.6 13 -2.6" stroke={darken(skin, 0.55)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      );
    default: // gülümseme
      return (
        <g>
          {woman && <path d="M53.5 65.5q6.5 5.4 13 0q-6.5 1.6 -13 0z" fill={lip} />}
          <path d="M53.5 65.5q6.5 5 13 0" stroke={darken(skin, 0.55)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

function Facial({ kind, color, skin }: { kind: string; color: string; skin: string }) {
  switch (kind) {
    case "stubble":
      return <path d="M39 58c1 12 9 21 21 21s20-9 21-21c-3 7-8 10-13 10-4-1-6-2-8-2s-4 1-8 2c-5 0-10-3-13-10z" fill={mix(skin, color, 0.32)} opacity="0.85" />;
    case "mustache":
      return <path d="M52 63c3-2.4 6-2.4 8-0.8 2-1.6 5-1.6 8 0.8-3 1.8-6 1.6-8 0.4-2 1.2-5 1.4-8-0.4z" fill={color} />;
    case "goatee":
      return (
        <g fill={color}>
          <path d="M52 63c3-2.4 6-2.4 8-0.8 2-1.6 5-1.6 8 0.8-3 1.8-6 1.6-8 0.4-2 1.2-5 1.4-8-0.4z" />
          <path d="M55 70c1.4 1.2 3 1.6 5 1.6s3.6-0.4 5-1.6c0 5-2 9-5 9s-5-4-5-9z" />
        </g>
      );
    case "beard":
      return (
        <g fill={color}>
          <path d="M37 52c0 19 9 29 23 29s23-10 23-29c-2 8-6 12-10 12-3 0-5-3-13-3s-10 3-13 3c-4 0-8-4-10-12z" />
          <path d="M52 63c3-2.4 6-2.4 8-0.8 2-1.6 5-1.6 8 0.8-3 1.8-6 1.6-8 0.4-2 1.2-5 1.4-8-0.4z" />
          {/* ağız için açıklık */}
          <path d="M54 66.6q6 3 12 0q-6 1 -12 0z" fill={darken(skin, 0.35)} />
        </g>
      );
    default:
      return null;
  }
}

// ---------------- Kıyafet ----------------

function Outfit({ kind, color, tie, woman, skin }: { kind: NonNullable<CharacterSpec["outfit"]>; color: string; tie: string; woman: boolean; skin: string }) {
  const body = "M6 120c0-21 15-33 37-37l17 7 17-7c22 4 37 16 37 37z";
  const lapelShade = darken(color, 0.3);
  const shirt = "#eef0f2";
  switch (kind) {
    case "turtleneck":
      return (
        <g>
          <path d="M6 120c0-21 15-33 37-37h34c22 4 37 16 37 37z" fill={color} />
          <path d="M47 72h26v12c-4 3-22 3-26 0z" fill={lighten(color, 0.08)} />
          {[52, 56, 60, 64, 68].map((x) => (
            <path key={x} d={`M${x} 73v10`} stroke={darken(color, 0.25)} strokeWidth="0.8" />
          ))}
        </g>
      );
    case "hoodie":
      return (
        <g>
          <path d="M6 120c0-21 15-33 37-37h34c22 4 37 16 37 37z" fill={color} />
          {/* kapüşon yakası */}
          <path d="M38 84c4-6 12-9 22-9s18 3 22 9c-6 6-14 8-22 8s-16-2-22-8z" fill={darken(color, 0.22)} />
          <path d="M45 84c4 3 9 4 15 4s11-1 15-4" stroke={darken(color, 0.4)} strokeWidth="1.2" fill="none" />
          <path d="M55 89v14M65 89v14" stroke="#e5e7eb" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="55" cy="104" r="1.2" fill="#e5e7eb" />
          <circle cx="65" cy="104" r="1.2" fill="#e5e7eb" />
        </g>
      );
    case "shirt":
      return (
        <g>
          <path d="M6 120c0-21 15-33 37-37h34c22 4 37 16 37 37z" fill={color} />
          <path d="M60 90l-11-9 3-4 8 6 8-6 3 4z" fill={lighten(color, 0.12)} />
          <path d="M60 90v30" stroke={darken(color, 0.25)} strokeWidth="1" />
          {[96, 104, 112].map((y) => (
            <circle key={y} cx="61.6" cy={y} r="0.9" fill={lighten(color, 0.4)} />
          ))}
          {/* açık yaka: ten */}
          <path d="M55 82l5 7 5-7z" fill={skin} />
        </g>
      );
    case "blazer":
      return (
        <g>
          <path d={body} fill={color} />
          {/* tişört */}
          <path d="M44 83c4 4 10 6 16 6s12-2 16-6l-3 37H47z" fill="#e8e6e1" />
          <path d="M50 84c3 2 6 3 10 3s7-1 10-3" stroke="#c9c6bf" strokeWidth="1" fill="none" />
          <path d="M43 83l9 37h-8L33 92zM77 83l-9 37h8l11-28z" fill={lapelShade} />
        </g>
      );
    default: {
      // takım (kravat ya da papyon)
      return (
        <g>
          <path d={body} fill={color} />
          {/* gömlek */}
          <path d="M45 83l15 8 15-8 -4 37H49z" fill={shirt} />
          <path d="M50 81l10 9 10-9 3 4-13 8-13-8z" fill="#fbfbfb" />
          {kind === "bowtie" ? (
            <g fill={tie}>
              <path d="M52 92l7 3v1l-7 3z" />
              <path d="M68 92l-7 3v1l7 3z" />
              <rect x="58.5" y="93.5" width="3" height="3" rx="1" fill={darken(tie, 0.2)} />
            </g>
          ) : woman ? (
            <path d="M55 83l5 8 5-8z" fill={skin} />
          ) : (
            <g>
              <path d="M57.5 92h5l1.2 4-3.7 22-3.7-22z" fill={tie} />
              <path d="M57.5 92h5l-1 3h-3z" fill={darken(tie, 0.2)} />
            </g>
          )}
          {/* yakalar */}
          <path d="M43 83l10 37h-7L33 92zM77 83l-10 37h7l13-28z" fill={lapelShade} />
          <path d="M43 83l6 15-7-3zM77 83l-6 15 7-3z" fill={darken(color, 0.15)} />
        </g>
      );
    }
  }
}

// ---------------- Aksesuarlar ----------------

function Eyewear({ kind }: { kind: string }) {
  switch (kind) {
    case "glasses":
      return (
        <g fill="none" stroke="#1b1f27" strokeWidth="1.8">
          <rect x="42.5" y="45" width="15" height="10.5" rx="3" fill="rgba(200,220,255,0.12)" />
          <rect x="62.5" y="45" width="15" height="10.5" rx="3" fill="rgba(200,220,255,0.12)" />
          <path d="M57.5 49q2.5 -1.6 5 0M42.5 49l-5 -1.5M77.5 49l5 -1.5" />
        </g>
      );
    case "round":
      return (
        <g fill="none" stroke="#a48231" strokeWidth="1.4">
          <circle cx="50" cy="50" r="6.2" fill="rgba(200,220,255,0.12)" />
          <circle cx="70" cy="50" r="6.2" fill="rgba(200,220,255,0.12)" />
          <path d="M56.2 49q3.8 -2 7.6 0M43.8 49l-6 -1.4M76.2 49l6 -1.4" />
        </g>
      );
    case "sunglasses":
      return (
        <g>
          <path d="M42 45h16v5c0 4-3 6-8 6s-8-2-8-6zM62 45h16v5c0 4-3 6-8 6s-8-2-8-6z" fill="#0b0f14" />
          <path d="M44 47l4 0M64 47l4 0" stroke="#4b5563" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M58 46.5h4M42 46l-5 -1M78 46l5 -1" stroke="#0b0f14" strokeWidth="1.8" />
        </g>
      );
    default:
      return null;
  }
}

function Headwear({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case "beanie":
      return (
        <g>
          <path d="M34 38c0-14 11-22 26-22s26 8 26 22z" fill={color} />
          <rect x="33" y="34" width="54" height="8" rx="3" fill={darken(color, 0.2)} />
          {[40, 46, 52, 58, 64, 70, 76, 82].map((x) => (
            <path key={x} d={`M${x} 35v6`} stroke={darken(color, 0.35)} strokeWidth="0.8" />
          ))}
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M35 37c0-13 11-20 25-20s25 7 25 20z" fill={color} />
          <path d="M35 37c-8 0-13 2-14 5h40c-6-3-15-5-26-5z" fill={darken(color, 0.25)} />
          <circle cx="60" cy="18" r="1.6" fill={darken(color, 0.3)} />
          <path d="M60 18v19" stroke={darken(color, 0.15)} strokeWidth="0.8" />
        </g>
      );
    case "fedora":
      return (
        <g>
          <ellipse cx="60" cy="33" rx="34" ry="5" fill={darken(color, 0.15)} />
          <path d="M40 33c0-12 6-19 20-19s20 7 20 19z" fill={color} />
          <path d="M51 17c3 3 15 3 18 0" stroke={darken(color, 0.3)} strokeWidth="1.2" fill="none" />
          <rect x="40" y="27" width="40" height="5" fill="#16110c" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M33 50c0-21 12-31 27-31s27 10 27 31" stroke="#1f2937" strokeWidth="4" fill="none" />
          <rect x="28" y="44" width="9" height="15" rx="4" fill="#111827" />
          <rect x="83" y="44" width="9" height="15" rx="4" fill="#111827" />
          <rect x="30" y="47" width="5" height="9" rx="2" fill="#c9a24a" />
          <rect x="85" y="47" width="5" height="9" rx="2" fill="#c9a24a" />
        </g>
      );
    default:
      return null;
  }
}

function Earrings({ kind }: { kind: string }) {
  if (kind === "stud")
    return (
      <g fill="#e3c987">
        <circle cx="35" cy="56" r="1.4" />
        <circle cx="85" cy="56" r="1.4" />
      </g>
    );
  if (kind === "hoop")
    return (
      <g fill="none" stroke="#e3c987" strokeWidth="1.2">
        <circle cx="35" cy="59" r="3" />
        <circle cx="85" cy="59" r="3" />
      </g>
    );
  return null;
}

// ---------------- Portre ----------------

const IRIS = ["#4a2f1b", "#2b1d14", "#3f5f3a", "#3b5a7a"];

export function Avatar({ spec, size = 120 }: { spec: CharacterSpec; size?: number }) {
  const id = useId().replace(/:/g, "");
  const woman = spec.gender === "woman";
  const age = spec.age ?? "middle";
  const senior = age === "senior";
  const skin = spec.skin;
  const shade = darken(skin, 0.14);
  // Kıdemlide saç kırlaşır (kel değilse), sakal da
  const hairColor = senior ? mix(spec.hairColor, "#c7cbd1", 0.55) : spec.hairColor;
  const browColor = spec.hair === "bald" && !senior ? darken(spec.hairColor, 0.1) : darken(hairColor, 0.1);
  const iris = IRIS[(skin.charCodeAt(2) + spec.hairColor.charCodeAt(3)) % IRIS.length];
  const hair = spec.hair;
  const headwear = spec.headwear ?? "none";
  // Bere ve şapka saçın üstünü kapatır: ön saç yerine kenarlar görünür
  const covered = headwear === "beanie" || headwear === "cap" || headwear === "fedora";
  const face = woman
    ? "M38 46c0-15 9-24 22-24s22 9 22 24v8c0 13-9 25-22 26-13-1-22-13-22-26z"
    : "M37 46c0-15 10-24 23-24s23 9 23 24v8c0 14-9 25-23 26-14-1-23-12-23-26z";

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Kurucu karakteri">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="1" stopColor="#7c2d12" />
        </linearGradient>
        <radialGradient id={`${id}-brass`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#e3c987" />
          <stop offset="1" stopColor="#7a5f24" />
        </radialGradient>
        <radialGradient id={`${id}-teal`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#2f7a73" />
          <stop offset="1" stopColor="#0f2f2c" />
        </radialGradient>
        <radialGradient id={`${id}-wine`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#7a2a3a" />
          <stop offset="1" stopColor="#2a0c14" />
        </radialGradient>
        <clipPath id={`${id}-face`}>
          <path d={face} />
        </clipPath>
      </defs>

      <Backdrop kind={spec.backdrop ?? "dark"} id={id} />
      {/* yumuşak ışık halesi */}
      <ellipse cx="60" cy="55" rx="46" ry="40" fill="#ffffff" opacity="0.04" />

      {(!covered || (hair !== "bun" && hair !== "afro")) && <HairBack style={hair} color={hairColor} />}

      <Outfit kind={spec.outfit ?? "suit"} color={spec.suit} tie={spec.tie ?? TIE_COLORS[0]} woman={woman} skin={skin} />

      {/* boyun */}
      <path d="M50 66h20v14c0 4-4 7-10 7s-10-3-10-7z" fill={skin} />
      <path d="M50 70c4 4 16 4 20 0v6c-6 3-14 3-20 0z" fill={shade} />
      {spec.outfit === "turtleneck" && <path d="M47 72h26v12c-4 3-22 3-26 0z" fill={lighten(spec.suit, 0.08)} />}

      {/* kulaklar */}
      <ellipse cx="36.5" cy="51" rx="3.6" ry="5.6" fill={skin} />
      <ellipse cx="83.5" cy="51" rx="3.6" ry="5.6" fill={skin} />
      <path d="M36 48q-1.5 3 0 6M84 48q1.5 3 0 6" stroke={shade} strokeWidth="1" fill="none" />

      {/* kafa ve gölgelendirme */}
      <path d={face} fill={skin} />
      <g clipPath={`url(#${id}-face)`}>
        <path d="M68 20c14 6 18 22 16 38-2 14-10 22-18 24 10-10 12-34 2-62z" fill="#000" opacity="0.07" />
        <ellipse cx="60" cy="24" rx="20" ry="6" fill="#000" opacity="0.06" />
      </g>

      {/* yaş izleri */}
      {age !== "young" && (
        <g stroke={darken(skin, 0.25)} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity={senior ? 0.9 : 0.5}>
          <path d="M46 54.5q4 1.6 8 0M66 54.5q4 1.6 8 0" />
          {senior && <path d="M50 35q10 -2.4 20 0M52 38.6q8 -1.6 16 0M53.5 59q-3 4 -2 8M66.5 59q3 4 2 8M42 49l-2.6 -1.2M78 49l2.6 -1.2" />}
        </g>
      )}
      {woman && !senior && (
        <g fill="#e06c6c" opacity="0.14">
          <ellipse cx="45" cy="59" rx="4.5" ry="2.6" />
          <ellipse cx="75" cy="59" rx="4.5" ry="2.6" />
        </g>
      )}

      {/* yüz */}
      <g color={skin}>
        <Eyes kind={spec.eyes ?? "almond"} iris={iris} />
      </g>
      {woman && (spec.eyes ?? "almond") !== "sleepy" && (
        <path d="M44.6 48.4l-1.6 -1.2M75.4 48.4l1.6 -1.2" stroke="#1c140f" strokeWidth="0.9" strokeLinecap="round" />
      )}
      <Brows kind={spec.brows ?? (woman ? "arched" : "soft")} color={browColor} />
      {/* burun */}
      <path d="M60 52q-1.4 5 -3.4 8.4q3.4 1.8 6.8 0" stroke={darken(skin, 0.28)} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M61 53q1.6 4 1 6" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.25" />
      <Mouth kind={spec.mouth ?? "smile"} woman={woman} skin={skin} />

      <Facial kind={facialOf(spec)} color={hairColor} skin={skin} />

      {covered ? (
        // başlık altından görünen saç kenarları
        hair !== "bald" && (
          <g fill={hairColor}>
            <path d="M35 40c-1 4-1 8 0 11l3 0 0-11zM85 40c1 4 1 8 0 11l-3 0 0-11z" />
            {(hair === "long" || hair === "wavy" || hair === "bob") && <path d="M34 42c-2 14-1 28 4 40l-6-2c-3-12-3-26 2-38zM86 42c2 14 1 28-4 40l6-2c3-12 3-26-2-38z" />}
          </g>
        )
      ) : (
        <HairFront style={hair} color={hairColor} senior={senior} />
      )}

      <Eyewear kind={eyewearOf(spec)} />
      <Headwear kind={headwear} color={lighten(spec.suit, 0.12)} />
      <Earrings kind={spec.earring ?? "none"} />
    </svg>
  );
}
