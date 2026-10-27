"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import {
  AGES, BACKDROPS, BROWS, EARRINGS, EYES, eyewearOf, EYEWEAR, facialOf, FACIAL, GENDERS, HAIR_COLORS, HAIR_STYLES, HEADWEAR, MOUTHS, OUTFITS,
  SKINS, SUITS, TIE_COLORS, type CharacterSpec,
} from "@/lib/game/config";

export const CHARACTER_TR = {
  gender: { man: "Erkek", woman: "Kadın" },
  age: { young: "Genç", middle: "Orta yaş", senior: "Kıdemli" },
  hair: {
    short: "Kısa", side: "Yandan ayrık", slick: "Geriye taranmış", undercut: "Yanları kazınmış", curly: "Kıvırcık", wavy: "Dalgalı",
    afro: "Afro", long: "Uzun", bob: "Küt", bun: "Topuz", ponytail: "At kuyruğu", bald: "Kel",
  },
  eyes: { round: "Yuvarlak", almond: "Badem", narrow: "Çekik", sleepy: "Ağır kapaklı" },
  brows: { soft: "Yumuşak", arched: "Kavisli", thick: "Kalın", straight: "Düz" },
  mouth: { smile: "Gülümseme", grin: "Geniş gülüş", neutral: "Ciddi", smirk: "Yarım gülüş" },
  facial: { none: "Yok", stubble: "Kirli sakal", mustache: "Bıyık", goatee: "Keçi sakal", beard: "Sakal" },
  eyewear: { none: "Yok", glasses: "Gözlük", round: "Yuvarlak gözlük", sunglasses: "Güneş gözlüğü" },
  headwear: { none: "Yok", beanie: "Bere", cap: "Şapka", fedora: "Fötr", headphones: "Kulaklık" },
  earring: { none: "Yok", stud: "Küpe", hoop: "Halka küpe" },
  outfit: { suit: "Takım ve kravat", bowtie: "Takım ve papyon", blazer: "Ceket ve tişört", turtleneck: "Boğazlı kazak", shirt: "Gömlek", hoodie: "Kapüşonlu" },
  backdrop: { dark: "Sade", office: "Ofis", city: "Şehir", brass: "Pirinç", teal: "Zümrüt", wine: "Bordo" },
} as const;

type Tab = "genel" | "yuz" | "sac" | "aksesuar" | "kiyafet";
const TABS: [Tab, string][] = [
  ["genel", "Genel"],
  ["yuz", "Yüz"],
  ["sac", "Saç"],
  ["aksesuar", "Aksesuar"],
  ["kiyafet", "Kıyafet"],
];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Rastgele ama makul bir karakter: aksesuarlar çoğunlukla boş kalır. */
export function randomCharacter(): CharacterSpec {
  const gender = pick(GENDERS);
  const woman = gender === "woman";
  const hairPool = woman ? (["long", "bob", "bun", "ponytail", "wavy", "curly", "short", "afro"] as const) : (["short", "side", "slick", "undercut", "curly", "afro", "wavy", "bald"] as const);
  const sometimes = <T,>(xs: readonly T[], p: number) => (Math.random() < p ? pick(xs.slice(1)) : xs[0]);
  return {
    gender,
    age: pick(AGES),
    skin: pick(SKINS),
    hair: pick(hairPool),
    hairColor: pick(HAIR_COLORS.filter((c) => c !== "#9ca3af")),
    suit: pick(SUITS),
    accessory: "none",
    eyes: pick(EYES),
    brows: woman ? pick(["arched", "soft", "straight"] as const) : pick(BROWS),
    mouth: pick(MOUTHS),
    facial: woman ? "none" : sometimes(FACIAL, 0.45),
    eyewear: sometimes(EYEWEAR, 0.3),
    headwear: sometimes(HEADWEAR, 0.15),
    earring: woman ? sometimes(EARRINGS, 0.5) : sometimes(EARRINGS, 0.08),
    outfit: Math.random() < 0.55 ? pick(["suit", "bowtie"] as const) : pick(OUTFITS),
    tie: pick(TIE_COLORS),
    backdrop: pick(BACKDROPS),
  };
}

/**
 * Kurucu görünümü düzenleyicisi. Seçenekler küçük portre önizlemeleriyle gösterilir: her düğme, o seçenek
 * uygulanmış hâlini çizer. Telefonda üstte canlı önizleme durur (sağ sütun ekranın dışında kalır).
 */
export function CharacterEditor({ value, onChange, preview }: { value: CharacterSpec; onChange: (c: CharacterSpec) => void; preview?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("genel");
  const set = (patch: Partial<CharacterSpec>) => onChange({ ...value, ...patch, accessory: "none", facial: patch.facial ?? facialOf(value), eyewear: patch.eyewear ?? eyewearOf(value) });
  const T = CHARACTER_TR;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 lg:hidden">
        {preview}
        <button type="button" className="btn !py-1.5 text-sm" onClick={() => onChange(randomCharacter())}>
          Rastgele
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-ink p-0.5 text-sm" role="tablist" aria-label="Görünüm bölümleri">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded px-3 py-1.5 ${tab === k ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="hidden text-sm text-amber hover:text-amber-soft lg:block" onClick={() => onChange(randomCharacter())}>
          Rastgele
        </button>
      </div>

      {tab === "genel" && (
        <div className="space-y-4">
          <Chips label="Görünüm" values={GENDERS} current={value.gender ?? "man"} text={(v) => T.gender[v]} onPick={(gender) => set({ gender, ...(gender === "woman" && facialOf(value) !== "none" ? { facial: "none" } : {}) })} />
          <Chips label="Yaş" values={AGES} current={value.age ?? "middle"} text={(v) => T.age[v]} onPick={(age) => set({ age })} />
          <Swatches label="Ten rengi" values={SKINS} current={value.skin} onPick={(skin) => set({ skin })} />
          <Thumbs label="Arka plan" values={BACKDROPS} current={value.backdrop ?? "dark"} text={(v) => T.backdrop[v]} spec={(backdrop) => ({ ...value, backdrop })} onPick={(backdrop) => set({ backdrop })} />
        </div>
      )}

      {tab === "yuz" && (
        <div className="space-y-4">
          <Thumbs label="Gözler" values={EYES} current={value.eyes ?? "almond"} text={(v) => T.eyes[v]} spec={(eyes) => ({ ...value, eyes })} onPick={(eyes) => set({ eyes })} zoom />
          <Thumbs label="Kaşlar" values={BROWS} current={value.brows ?? (value.gender === "woman" ? "arched" : "soft")} text={(v) => T.brows[v]} spec={(brows) => ({ ...value, brows })} onPick={(brows) => set({ brows })} zoom />
          <Thumbs label="İfade" values={MOUTHS} current={value.mouth ?? "smile"} text={(v) => T.mouth[v]} spec={(mouth) => ({ ...value, mouth })} onPick={(mouth) => set({ mouth })} zoom />
        </div>
      )}

      {tab === "sac" && (
        <div className="space-y-4">
          <Thumbs label="Saç modeli" values={HAIR_STYLES} current={value.hair} text={(v) => T.hair[v]} spec={(hair) => ({ ...value, hair, headwear: "none" })} onPick={(hair) => set({ hair })} />
          <Swatches label="Saç rengi" values={HAIR_COLORS} current={value.hairColor} onPick={(hairColor) => set({ hairColor })} />
          {value.age === "senior" && <p className="text-xs text-mute">Kıdemli görünümde saç ve sakal kendiliğinden kırlaşır.</p>}
        </div>
      )}

      {tab === "aksesuar" && (
        <div className="space-y-4">
          <Thumbs label="Yüz kılı" values={FACIAL} current={facialOf(value)} text={(v) => T.facial[v]} spec={(facial) => ({ ...value, facial })} onPick={(facial) => set({ facial })} zoom />
          <Thumbs label="Gözlük" values={EYEWEAR} current={eyewearOf(value)} text={(v) => T.eyewear[v]} spec={(eyewear) => ({ ...value, eyewear })} onPick={(eyewear) => set({ eyewear })} zoom />
          <Thumbs label="Başlık" values={HEADWEAR} current={value.headwear ?? "none"} text={(v) => T.headwear[v]} spec={(headwear) => ({ ...value, headwear })} onPick={(headwear) => set({ headwear })} />
          <Chips label="Küpe" values={EARRINGS} current={value.earring ?? "none"} text={(v) => T.earring[v]} onPick={(earring) => set({ earring })} />
        </div>
      )}

      {tab === "kiyafet" && (
        <div className="space-y-4">
          <Thumbs label="Kıyafet" values={OUTFITS} current={value.outfit ?? "suit"} text={(v) => T.outfit[v]} spec={(outfit) => ({ ...value, outfit })} onPick={(outfit) => set({ outfit })} />
          <Swatches label="Kıyafet rengi" values={SUITS} current={value.suit} onPick={(suit) => set({ suit })} />
          {(value.outfit ?? "suit") === "suit" || value.outfit === "bowtie" ? (
            <Swatches label={value.outfit === "bowtie" ? "Papyon rengi" : "Kravat rengi"} values={TIE_COLORS} current={value.tie ?? TIE_COLORS[0]} onPick={(tie) => set({ tie })} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------- Seçiciler ----------------

function Chips<T extends string>({ label, values, current, text, onPick }: { label: string; values: readonly T[]; current: T; text: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={current === v}
            onClick={() => onPick(v)}
            className={`rounded border px-3 py-1.5 text-sm transition-colors ${current === v ? "border-amber bg-amber/10 text-amber-soft" : "border-line text-mute hover:text-white"}`}
          >
            {text(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Swatches({ label, values, current, onPick }: { label: string; values: readonly string[]; current: string; onPick: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-label={v}
            aria-pressed={current === v}
            onClick={() => onPick(v)}
            style={{ background: v }}
            className={`h-9 w-9 rounded-full border-2 transition-transform ${current === v ? "scale-110 border-amber" : "border-line hover:scale-105"}`}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** Her seçenek, uygulanmış hâliyle küçük bir portre. zoom: yüze yakınlaş (göz, kaş, ağız için). */
function Thumbs<T extends string>({
  label,
  values,
  current,
  text,
  spec,
  onPick,
  zoom,
}: {
  label: string;
  values: readonly T[];
  current: T;
  text: (v: T) => string;
  spec: (v: T) => CharacterSpec;
  onPick: (v: T) => void;
  zoom?: boolean;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={current === v}
            onClick={() => onPick(v)}
            className={`group overflow-hidden rounded-md border text-center transition-colors ${current === v ? "border-amber bg-amber/10" : "border-line hover:border-white/40"}`}
          >
            <span className="relative block aspect-square overflow-hidden">
              <span className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" style={zoom ? { transform: "scale(1.9) translateY(8%)" } : undefined}>
                <Avatar spec={spec(v)} size={200} />
              </span>
            </span>
            <span className={`block truncate px-1 py-1 text-[11px] ${current === v ? "text-amber-soft" : "text-mute"}`}>{text(v)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
