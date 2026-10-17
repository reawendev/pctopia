"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import {
  ACCESSORIES,
  DEFAULT_CHARACTER,
  DEFAULT_LOGO,
  HAIR_COLORS,
  HAIR_STYLES,
  LOGO_BG,
  LOGO_COLORS,
  LOGO_SHAPES,
  LOGO_SYMBOLS,
  SKINS,
  START_CASH,
  SUITS,
  type CharacterSpec,
  type LogoSpec,
} from "@/lib/game/config";
import { formatMoney } from "@/lib/game/economy";
import { apiFetch } from "@/lib/supabase/client";
import { useRequireSession } from "@/lib/useSession";

const TR = {
  shape: { circle: "Daire", square: "Kare", hex: "Altıgen", shield: "Kalkan" },
  symbol: { chip: "Çip", bolt: "Şimşek", diamond: "Elmas", peak: "Zirve", ring: "Halka" },
  hair: { short: "Kısa", side: "Yandan", long: "Uzun", bald: "Kel" },
  accessory: { none: "Yok", glasses: "Gözlük", beard: "Sakal" },
} as const;

export default function Kurulus() {
  const router = useRouter();
  const ready = useRequireSession();
  const [founderName, setFounderName] = useState("");
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<LogoSpec>(DEFAULT_LOGO);
  const [character, setCharacter] = useState<CharacterSpec>(DEFAULT_CHARACTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    apiFetch("/api/company").then((s) => {
      if (s.hasCompany) router.replace("/oyun");
    });
  }, [ready, router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/company", { method: "POST", body: JSON.stringify({ name, founderName, logo, character }) });
      router.replace("/oyun");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Şirketini Kur</h1>
      <p className="mb-6 mt-1 text-sm text-mute">
        Başlangıç sermayen {formatMoney(START_CASH)}. İsim, logo ve karakter sonradan değiştirilemez.
      </p>

      <form onSubmit={create} className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <section className="card space-y-4 p-4">
            <div>
              <label className="label" htmlFor="founder">Kurucu adı</label>
              <input id="founder" className="input" value={founderName} onChange={(e) => setFounderName(e.target.value)} maxLength={24} placeholder="Adın" required />
            </div>
            <div>
              <label className="label" htmlFor="company">Şirket adı</label>
              <input id="company" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} placeholder="Örn. Nova Bilişim" required />
            </div>
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-sm font-semibold">Logo</h2>
            <Options label="Biçim" values={LOGO_SHAPES} current={logo.shape} text={(v) => TR.shape[v]} onPick={(shape) => setLogo({ ...logo, shape })} />
            <Options label="Sembol" values={LOGO_SYMBOLS} current={logo.symbol} text={(v) => TR.symbol[v]} onPick={(symbol) => setLogo({ ...logo, symbol })} />
            <Swatches label="Sembol rengi" values={LOGO_COLORS} current={logo.color} onPick={(color) => setLogo({ ...logo, color })} />
            <Swatches label="Zemin rengi" values={LOGO_BG} current={logo.bg} onPick={(bg) => setLogo({ ...logo, bg })} />
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-sm font-semibold">Karakter</h2>
            <Swatches label="Ten" values={SKINS} current={character.skin} onPick={(skin) => setCharacter({ ...character, skin })} />
            <Options label="Saç" values={HAIR_STYLES} current={character.hair} text={(v) => TR.hair[v]} onPick={(hair) => setCharacter({ ...character, hair })} />
            <Swatches label="Saç rengi" values={HAIR_COLORS} current={character.hairColor} onPick={(hairColor) => setCharacter({ ...character, hairColor })} />
            <Swatches label="Takım elbise" values={SUITS} current={character.suit} onPick={(suit) => setCharacter({ ...character, suit })} />
            <Options label="Aksesuar" values={ACCESSORIES} current={character.accessory} text={(v) => TR.accessory[v]} onPick={(accessory) => setCharacter({ ...character, accessory })} />
          </section>
        </div>

        <aside className="md:sticky md:top-6 md:self-start">
          <div className="card overflow-hidden">
            <Avatar spec={character} size={280} />
            <div className="flex items-center gap-3 border-t border-line p-4">
              <Logo spec={logo} size={44} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{name || "Şirket Adı"}</div>
                <div className="truncate text-xs text-mute">Kurucu: {founderName || "—"}</div>
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-loss">{error}</p>}
          <button className="btn btn-primary mt-3 w-full" disabled={busy}>
            {busy ? "Kuruluyor…" : "Şirketi kur"}
          </button>
        </aside>
      </form>
    </main>
  );
}

function Options<T extends string>({ label, values, current, text, onPick }: { label: string; values: readonly T[]; current: T; text: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`rounded-md border px-3 py-1.5 text-sm ${current === v ? "border-amber bg-amber/10 text-amber" : "border-line text-mute hover:text-white"}`}
          >
            {text(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, values, current, onPick }: { label: string; values: readonly string[]; current: string; onPick: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-label={v}
            onClick={() => onPick(v)}
            style={{ background: v }}
            className={`h-9 w-9 rounded-md border-2 ${current === v ? "border-amber" : "border-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
