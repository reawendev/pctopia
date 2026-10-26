"use client";

import { useEffect, useState } from "react";
import { UploadButton } from "@/components/Appearance";
import { useRouter } from "next/navigation";
import { CompanyMark, Portrait } from "@/components/Portrait";
import {
  ACCESSORIES,
  AGES,
  DEFAULT_CHARACTER,
  DEFAULT_LOGO,
  GENDERS,
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
import { apiFetch, supabaseBrowser } from "@/lib/supabase/client";
import { useRequireSession } from "@/lib/useSession";
import { Splash } from "@/components/Splash";

const TR = {
  gender: { man: "Erkek", woman: "Kadın" },
  age: { young: "Genç", middle: "Orta yaş", senior: "Kıdemli" },
  shape: { circle: "Daire", square: "Kare", hex: "Altıgen", shield: "Kalkan" },
  symbol: { chip: "Çip", bolt: "Şimşek", diamond: "Elmas", peak: "Zirve", ring: "Halka" },
  hair: { short: "Kısa", side: "Yandan ayrık", long: "Uzun", bald: "Kel" },
  accessory: { none: "Yok", glasses: "Gözlük", beard: "Sakal" },
} as const;

type Asset = { id: string; url: string };
type GenStatus = { enabled: boolean; limit: number; remaining: { portrait: number; logo: number }; reason?: string };

export default function Kurulus() {
  const router = useRouter();
  const ready = useRequireSession();
  const [founderName, setFounderName] = useState("");
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<LogoSpec>(DEFAULT_LOGO);
  const [character, setCharacter] = useState<CharacterSpec>(DEFAULT_CHARACTER);
  const [portrait, setPortrait] = useState<Asset | null>(null);
  const [emblem, setEmblem] = useState<Asset | null>(null);
  const [gen, setGen] = useState<GenStatus | null>(null);
  const [generating, setGenerating] = useState<"portrait" | "logo" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!ready) return;
    apiFetch("/api/company")
      .then((s) => {
        if (s.hasCompany) router.replace("/oyun");
        else setChecked(true);
      })
      .catch(() => setChecked(true));
    apiFetch<GenStatus>("/api/generate").then(setGen).catch(() => setGen(null));
    // Google ile girildiyse kurucu adını hesaptaki addan öner (oyuncu değiştirebilir)
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        const m = data.user?.user_metadata ?? {};
        const full = String(m.full_name || m.name || "").trim().replace(/\s+/g, " ");
        if (full) setFounderName((cur) => cur || full.slice(0, 24));
      })
      .catch(() => {});
  }, [ready, router]);

  async function generate(kind: "portrait" | "logo") {
    setGenerating(kind);
    setError("");
    try {
      const r = await apiFetch<Asset & { kind: string }>("/api/generate", {
        method: "POST",
        body: JSON.stringify(kind === "portrait" ? { kind, character } : { kind, logo }),
      });
      if (kind === "portrait") setPortrait({ id: r.id, url: r.url });
      else setEmblem({ id: r.id, url: r.url });
      setGen((g) => (g ? { ...g, remaining: { ...g.remaining, [kind]: Math.max(0, g.remaining[kind] - 1) } } : g));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/company", {
        method: "POST",
        body: JSON.stringify({ name, founderName, logo, character, portraitId: portrait?.id, logoId: emblem?.id }),
      });
      router.replace("/oyun");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const splash = <Splash key="splash" done={ready && checked} status="Tescil dairesi açılıyor" />;
  if (!ready) return <>{splash}</>;

  const canGenerate = !!gen?.enabled;

  return (
    <>
    {splash}
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.02em] sm:text-3xl">Şirket tescili</h1>
        <p className="mt-3 leading-relaxed text-mute">
          Elinde {formatMoney(START_CASH)} birikim ve bir garaj var. Önce kendini tanıt, sonra şirketine bir isim ve arma seç. Tescilden sonra
          bunlar değiştirilemez.
        </p>
      </header>

      <form onSubmit={create} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* 1. Kurucu */}
          <section className="card p-5">
            <StepTitle n={1} title="Kurucu" />
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="founder">Adın</label>
                <input id="founder" className="input" value={founderName} onChange={(e) => setFounderName(e.target.value)} maxLength={24} placeholder="Örn. Mehmet Ali" required />
              </div>
              <Options label="Görünüm" values={GENDERS} current={character.gender ?? "man"} text={(v) => TR.gender[v]} onPick={(gender) => setCharacter({ ...character, gender })} />
              <Options label="Yaş" values={AGES} current={character.age ?? "middle"} text={(v) => TR.age[v]} onPick={(age) => setCharacter({ ...character, age })} />
              <Swatches label="Ten rengi" values={SKINS} current={character.skin} onPick={(skin) => setCharacter({ ...character, skin })} />
              <Options label="Saç" values={HAIR_STYLES} current={character.hair} text={(v) => TR.hair[v]} onPick={(hair) => setCharacter({ ...character, hair })} />
              <Swatches label="Saç rengi" values={HAIR_COLORS} current={character.hairColor} onPick={(hairColor) => setCharacter({ ...character, hairColor })} />
              <Swatches label="Takım elbise" values={SUITS} current={character.suit} onPick={(suit) => setCharacter({ ...character, suit })} />
              <Options label="Ayrıntı" values={ACCESSORIES} current={character.accessory} text={(v) => TR.accessory[v]} onPick={(accessory) => setCharacter({ ...character, accessory })} />
            </div>
            <GenerateRow
              enabled={canGenerate}
              reason={gen?.reason}
              remaining={gen?.remaining.portrait ?? 0}
              busy={generating === "portrait"}
              disabled={generating !== null}
              has={!!portrait}
              label="Portreyi çizdir"
              upload={<UploadButton kind="portrait" label="Kendi fotoğrafını yükle" notify={setError} disabled={generating !== null} onUploaded={(a) => setPortrait({ id: a.id, url: a.url })} />}
              onGenerate={() => generate("portrait")}
              onClear={() => setPortrait(null)}
            />
          </section>

          {/* 2. Şirket */}
          <section className="card p-5">
            <StepTitle n={2} title="Şirket" />
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="company">Şirket adı</label>
                <input id="company" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} placeholder="Örn. Nova Bilişim" required />
              </div>
              <Options label="Arma biçimi" values={LOGO_SHAPES} current={logo.shape} text={(v) => TR.shape[v]} onPick={(shape) => setLogo({ ...logo, shape })} />
              <Options label="Sembol" values={LOGO_SYMBOLS} current={logo.symbol} text={(v) => TR.symbol[v]} onPick={(symbol) => setLogo({ ...logo, symbol })} />
              <Swatches label="Sembol rengi" values={LOGO_COLORS} current={logo.color} onPick={(color) => setLogo({ ...logo, color })} />
              <Swatches label="Zemin rengi" values={LOGO_BG} current={logo.bg} onPick={(bg) => setLogo({ ...logo, bg })} />
            </div>
            <GenerateRow
              enabled={canGenerate}
              reason={gen?.reason}
              remaining={gen?.remaining.logo ?? 0}
              busy={generating === "logo"}
              disabled={generating !== null}
              has={!!emblem}
              label="Armayı çizdir"
              upload={<UploadButton kind="logo" label="Kendi logonu yükle" notify={setError} disabled={generating !== null} onUploaded={(a) => setEmblem({ id: a.id, url: a.url })} />}
              onGenerate={() => generate("logo")}
              onClear={() => setEmblem(null)}
            />
          </section>
        </div>

        {/* 3. Tescil */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3">
              <StepTitle n={3} title="Tescil" />
            </div>
            <div className="p-5">
              <div className="mx-auto w-fit rounded-sm border border-amber/50 p-1">
                <Portrait spec={character} url={portrait?.url} size={200} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <CompanyMark spec={logo} url={emblem?.url} size={48} title={name} />
                <div className="min-w-0">
                  <div className="heading truncate text-lg">{name || "Şirket adı"}</div>
                  <div className="truncate text-sm text-mute">Kurucu: {founderName || "henüz yazılmadı"}</div>
                </div>
              </div>
              <dl className="mt-4 flex justify-between border-t border-line pt-3 text-sm">
                <dt className="text-mute">Başlangıç sermayesi</dt>
                <dd className="num">{formatMoney(START_CASH)}</dd>
              </dl>
              {error && (
                <p className="mt-3 text-sm text-loss" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary mt-4 w-full" disabled={busy || generating !== null}>
                {busy ? "Tescil ediliyor…" : "Şirketi tescil et"}
              </button>
            </div>
          </section>
        </aside>
      </form>
    </main>
    </>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-baseline gap-3">
      <span className="font-serif text-lg text-amber">{n}.</span>
      <span className="heading text-lg">{title}</span>
    </h2>
  );
}

function GenerateRow(props: {
  enabled: boolean;
  reason?: string;
  remaining: number;
  busy: boolean;
  disabled: boolean;
  has: boolean;
  label: string;
  upload: React.ReactNode;
  onGenerate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-5 space-y-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {props.upload}
        {props.enabled && (
          <button type="button" className="btn" disabled={props.disabled || props.remaining < 1} onClick={props.onGenerate}>
            {props.busy ? "Çiziliyor, 30 saniye kadar sürebilir…" : props.has ? "Yeniden çizdir" : props.label}
          </button>
        )}
        {props.has && !props.busy && (
          <button type="button" className="text-sm text-mute underline-offset-4 hover:text-white hover:underline" onClick={props.onClear}>
            Sade görsele dön
          </button>
        )}
      </div>
      <p className="text-xs text-mute">
        PNG, JPEG ya da WebP, en fazla 1 MB.{" "}
        {props.enabled ? `PixelLab ile bugün ${props.remaining} çizim hakkın kaldı.` : props.reason ?? "Yüklemezsen yukarıdaki seçimlerinle çizilen sade görsel kullanılır."}
      </p>
    </div>
  );
}

function Options<T extends string>({ label, values, current, text, onPick }: { label: string; values: readonly T[]; current: T; text: (v: T) => string; onPick: (v: T) => void }) {
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
            className={`h-9 w-9 rounded border-2 ${current === v ? "border-amber" : "border-line"}`}
          />
        ))}
      </div>
    </fieldset>
  );
}
