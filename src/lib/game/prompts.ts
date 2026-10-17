// Oyuncu seçimlerini PixelLab tariflerine çevirir (İngilizce, model en iyi böyle anlıyor).

import type { CharacterSpec, LogoSpec } from "./config";

const SKIN: Record<string, string> = {
  "#f1d3b8": "fair skin",
  "#e0b48c": "light olive skin",
  "#c68b5f": "tan skin",
  "#8d5a3b": "brown skin",
  "#5b3a29": "dark brown skin",
};

const HAIR_COLOR: Record<string, string> = {
  "#1a1411": "black",
  "#4a2f1b": "dark brown",
  "#8a5a2b": "light brown",
  "#c9a15a": "blonde",
  "#9ca3af": "grey",
  "#7c2d12": "auburn",
};

const SUIT: Record<string, string> = {
  "#1f2937": "charcoal grey suit",
  "#0f2a43": "navy blue suit",
  "#3b1d2a": "burgundy suit",
  "#14352a": "dark green suit",
  "#44403c": "taupe suit",
};

const COLOR: Record<string, string> = {
  "#f2b441": "gold",
  "#4ade80": "emerald green",
  "#38bdf8": "sky blue",
  "#f87171": "crimson red",
  "#a78bfa": "violet",
  "#e2e8f0": "silver white",
  "#fb923c": "orange",
  "#2dd4bf": "teal",
  "#0f172a": "deep navy",
  "#111827": "black",
  "#1e293b": "slate blue",
  "#1c1917": "dark charcoal",
  "#022c22": "dark forest green",
  "#1e1b4b": "midnight indigo",
  "#450a0a": "dark maroon",
  "#ffffff": "white",
};

const SHAPE: Record<LogoSpec["shape"], string> = {
  circle: "circular badge",
  square: "rounded square badge",
  hex: "hexagonal badge",
  shield: "shield-shaped crest",
};

const SYMBOL: Record<LogoSpec["symbol"], string> = {
  chip: "a stylized microchip",
  bolt: "a lightning bolt",
  diamond: "a geometric diamond",
  peak: "a mountain peak",
  ring: "a concentric ring",
};

export function portraitPrompt(c: CharacterSpec): { description: string; negative: string } {
  const gender = c.gender === "woman" ? "businesswoman" : "businessman";
  const age = c.age === "young" ? "young adult" : c.age === "senior" ? "senior, around 60 years old" : "middle-aged";
  const hair =
    c.hair === "bald"
      ? "bald head"
      : c.hair === "long"
      ? `long ${HAIR_COLOR[c.hairColor] ?? "dark"} hair`
      : c.hair === "side"
      ? `${HAIR_COLOR[c.hairColor] ?? "dark"} side-parted hair`
      : `short ${HAIR_COLOR[c.hairColor] ?? "dark"} hair`;
  const extra = c.accessory === "glasses" ? ", wearing thin-rimmed glasses" : c.accessory === "beard" ? `, well-groomed ${HAIR_COLOR[c.hairColor] ?? "dark"} beard` : "";
  return {
    description:
      `bust portrait of a ${age} ${gender} CEO, ${SKIN[c.skin] ?? "light skin"}, ${hair}${extra}, ` +
      `wearing a ${SUIT[c.suit] ?? "dark suit"} with white shirt, confident serious expression, facing viewer, ` +
      `dark executive office background, muted realistic colors, dramatic soft lighting`,
    negative: "cartoon, chibi, cute, big eyes, exaggerated, text, watermark, multiple people, full body",
  };
}

export function logoPrompt(l: LogoSpec): { description: string; negative: string } {
  return {
    description:
      `corporate emblem logo for a technology company, ${SHAPE[l.shape]} containing ${SYMBOL[l.symbol]}, ` +
      `${COLOR[l.color] ?? "gold"} symbol on ${COLOR[l.bg] ?? "dark"} background, symmetrical, centered, clean bold shapes, premium, minimal`,
    negative: "text, letters, words, watermark, cartoon character, face, cluttered, blurry",
  };
}
