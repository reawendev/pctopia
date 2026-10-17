import type { LogoSpec } from "@/lib/game/config";

const SHAPES: Record<LogoSpec["shape"], string> = {
  circle: "M32 4a28 28 0 1 0 0 56a28 28 0 1 0 0-56z",
  square: "M10 4h44a6 6 0 0 1 6 6v44a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6z",
  hex: "M32 3l25 14.5v29L32 61 7 46.5v-29z",
  shield: "M32 3l23 7v20c0 15-10 25-23 31C19 55 9 45 9 30V10z",
};

function Symbol({ kind, color }: { kind: LogoSpec["symbol"]; color: string }) {
  switch (kind) {
    case "chip":
      return (
        <g stroke={color} strokeWidth="3" fill="none" strokeLinecap="round">
          <rect x="22" y="22" width="20" height="20" rx="2" />
          <rect x="28" y="28" width="8" height="8" fill={color} stroke="none" />
          <path d="M27 17v5M32 17v5M37 17v5M27 42v5M32 42v5M37 42v5M17 27h5M17 32h5M17 37h5M42 27h5M42 32h5M42 37h5" strokeWidth="2" />
        </g>
      );
    case "bolt":
      return <polygon points="35,14 20,36 30,36 27,50 44,27 33,27" fill={color} />;
    case "diamond":
      return <polygon points="32,15 47,32 32,49 17,32" fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" />;
    case "peak":
      return <polygon points="14,46 27,21 34,33 40,25 50,46" fill={color} />;
    case "ring":
      return (
        <g>
          <circle cx="32" cy="32" r="14" fill="none" stroke={color} strokeWidth="4" />
          <circle cx="32" cy="32" r="4" fill={color} />
        </g>
      );
  }
}

export function Logo({ spec, size = 48, title }: { spec: LogoSpec; size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={title ?? "Şirket logosu"}>
      <path d={SHAPES[spec.shape]} fill={spec.bg} stroke={spec.color} strokeWidth="2.5" strokeLinejoin="round" />
      <Symbol kind={spec.symbol} color={spec.color} />
    </svg>
  );
}
