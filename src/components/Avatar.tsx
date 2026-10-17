import type { CharacterSpec } from "@/lib/game/config";

function Hair({ style, color }: { style: CharacterSpec["hair"]; color: string }) {
  switch (style) {
    case "short":
      return <path d="M36 50c-2-20 10-28 24-28s26 8 24 28c-3-9-8-13-14-14-8 3-24 3-34 14z" fill={color} />;
    case "side":
      return <path d="M35 52c-3-22 12-31 27-29 14 2 24 10 22 29-2-8-6-14-12-16-12 4-26 2-37 16z" fill={color} />;
    case "long":
      return (
        <g fill={color}>
          <path d="M34 54c-4-24 10-33 26-33s30 9 26 33l2 30c-4 2-8 0-9-4l-2-24c-8-4-24-4-32 0l-2 24c-1 4-5 6-9 4z" />
        </g>
      );
    case "bald":
      return null;
  }
}

export function Avatar({ spec, size = 120 }: { spec: CharacterSpec; size?: number }) {
  const shade = "rgba(0,0,0,0.18)";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Kurucu karakteri">
      <rect width="120" height="120" fill="#161e29" />
      {/* omuzlar ve takım elbise */}
      <path d="M8 120c0-22 16-34 38-38h28c22 4 38 16 38 38z" fill={spec.suit} />
      {/* gömlek; kravat yalnızca erkek görünümde */}
      <path d="M50 82h20l-10 22z" fill="#e5e7eb" />
      {spec.gender === "woman" ? (
        <path d="M54 82h12l-6 12z" fill={spec.skin} />
      ) : (
        <path d="M57 90h6l2 22-5 5-5-5z" fill="#7f1d1d" />
      )}
      {/* boyun */}
      <rect x="50" y="68" width="20" height="18" rx="4" fill={spec.skin} />
      <rect x="50" y="68" width="20" height="8" fill={shade} />
      {/* saç arkası (uzun) */}
      {spec.hair === "long" && <rect x="34" y="40" width="52" height="44" rx="14" fill={spec.hairColor} />}
      {/* kafa */}
      <ellipse cx="60" cy="48" rx="25" ry="29" fill={spec.skin} />
      {/* kulaklar */}
      <ellipse cx="35" cy="50" rx="4" ry="6" fill={spec.skin} />
      <ellipse cx="85" cy="50" rx="4" ry="6" fill={spec.skin} />
      {/* yüz */}
      <circle cx="50" cy="49" r="2.4" fill="#111827" />
      <circle cx="70" cy="49" r="2.4" fill="#111827" />
      <path d="M52 63q8 4 16 0" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M59 52l-2 7h5" stroke={shade} strokeWidth="2" fill="none" strokeLinecap="round" />
      <Hair style={spec.hair} color={spec.hairColor} />
      {spec.accessory === "beard" && (
        <path d="M37 54c0 18 10 28 23 28s23-10 23-28c-4 10-10 12-14 10-6 3-12 3-18 0-4 2-10 0-14-10z" fill={spec.hairColor} />
      )}
      {spec.accessory === "glasses" && (
        <g fill="none" stroke="#0b0f14" strokeWidth="2.2">
          <rect x="41" y="43" width="14" height="11" rx="3" />
          <rect x="65" y="43" width="14" height="11" rx="3" />
          <path d="M55 48h10" />
        </g>
      )}
    </svg>
  );
}
