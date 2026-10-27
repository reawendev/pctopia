// Oyuncu seçimlerini PixelLab tariflerine çevirir (İngilizce, model en iyi böyle anlıyor).

import { eyewearOf, facialOf, type CharacterSpec, type LogoSpec } from "./config";

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

const HAIR_STYLE: Record<CharacterSpec["hair"], string> = {
  short: "short neat",
  side: "side-parted",
  slick: "slicked-back",
  undercut: "undercut with short sides and longer top",
  curly: "short curly",
  wavy: "shoulder-length wavy",
  afro: "voluminous afro",
  long: "long straight",
  bob: "chin-length bob with bangs",
  bun: "tied in a top bun",
  ponytail: "pulled back into a ponytail",
  bald: "",
};
const EXPRESSION: Record<string, string> = { smile: "warm confident smile", grin: "broad grin", neutral: "calm serious expression", smirk: "subtle smirk" };
const EYES_TXT: Record<string, string> = { round: "round eyes", almond: "almond-shaped eyes", narrow: "narrow eyes", sleepy: "heavy-lidded eyes" };
const FACIAL_TXT: Record<string, string> = { stubble: "light stubble", mustache: "a mustache", goatee: "a goatee", beard: "a well-groomed beard" };
const EYEWEAR_TXT: Record<string, string> = { glasses: "rectangular glasses", round: "round gold-rimmed glasses", sunglasses: "dark sunglasses" };
const HEADWEAR_TXT: Record<string, string> = { beanie: "a knit beanie", cap: "a baseball cap", fedora: "a fedora hat", headphones: "headphones around the head" };
const EARRING_TXT: Record<string, string> = { stud: "small gold stud earrings", hoop: "gold hoop earrings" };
const OUTFIT_TXT: Record<string, (c: string, tie: string) => string> = {
  suit: (c, tie) => `a ${c} with white shirt and ${tie} tie`,
  bowtie: (c, tie) => `a ${c} with white shirt and ${tie} bow tie`,
  blazer: (c) => `a ${c.replace(" suit", "")} blazer over a white t-shirt`,
  turtleneck: (c) => `a ${c.replace(" suit", "")} turtleneck sweater`,
  shirt: (c) => `a ${c.replace(" suit", "")} button-up shirt with open collar`,
  hoodie: (c) => `a ${c.replace(" suit", "")} hoodie`,
};
const TIE_TXT: Record<string, string> = { "#7f1d1d": "dark red", "#1e3a8a": "royal blue", "#a16207": "mustard", "#14532d": "dark green", "#111827": "black", "#9d174d": "magenta" };
const BACKDROP_TXT: Record<string, string> = {
  dark: "dark plain background",
  office: "executive office background with window blinds and bookshelf",
  city: "night city skyline background",
  brass: "warm golden gradient background",
  teal: "deep teal gradient background",
  wine: "deep burgundy gradient background",
};

export function portraitPrompt(c: CharacterSpec): { description: string; negative: string } {
  const woman = c.gender === "woman";
  const gender = woman ? "businesswoman" : "businessman";
  const age = c.age === "young" ? "young adult" : c.age === "senior" ? "senior, around 60 years old" : "middle-aged";
  const color = c.age === "senior" ? "grey" : HAIR_COLOR[c.hairColor] ?? "dark";
  const hair = c.hair === "bald" ? "bald head" : `${color} hair, ${HAIR_STYLE[c.hair] ?? "short"}`;
  const facial = facialOf(c);
  const eyewear = eyewearOf(c);
  const extras = [
    facial !== "none" ? FACIAL_TXT[facial] : "",
    eyewear !== "none" ? `wearing ${EYEWEAR_TXT[eyewear]}` : "",
    c.headwear && c.headwear !== "none" ? `wearing ${HEADWEAR_TXT[c.headwear]}` : "",
    c.earring && c.earring !== "none" ? EARRING_TXT[c.earring] : "",
  ].filter(Boolean);
  const outfit = (OUTFIT_TXT[c.outfit ?? "suit"] ?? OUTFIT_TXT.suit)(SUIT[c.suit] ?? "dark suit", TIE_TXT[c.tie ?? ""] ?? "dark red");
  return {
    description:
      `bust portrait of a ${age} ${gender} CEO, ${SKIN[c.skin] ?? "light skin"}, ${hair}, ${EYES_TXT[c.eyes ?? "almond"]}` +
      `${extras.length ? `, ${extras.join(", ")}` : ""}, wearing ${outfit}, ${EXPRESSION[c.mouth ?? "smile"]}, facing viewer, ` +
      `${BACKDROP_TXT[c.backdrop ?? "office"]}, muted realistic colors, dramatic soft lighting`,
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
