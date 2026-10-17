"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyMark, Portrait } from "./Portrait";
import type { CharacterSpec, LogoSpec } from "@/lib/game/config";
import { apiFetch, apiUpload } from "@/lib/supabase/client";

type Kind = "portrait" | "logo";
type Asset = { id: string; url: string };

/** Dosya seçtirip /api/upload'a gönderen düğme. */
export function UploadButton({ kind, onUploaded, notify, disabled, label }: { kind: Kind; onUploaded: (a: Asset) => void; notify: (m: string) => void; disabled?: boolean; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1_000_000) return notify("Dosya en fazla 1 MB olabilir");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", f);
      onUploaded(await apiUpload<Asset>("/api/upload", fd));
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
      <button type="button" className="btn !py-2" disabled={disabled || busy} onClick={() => ref.current?.click()}>
        {busy ? "Yükleniyor…" : label ?? "Görsel yükle"}
      </button>
    </>
  );
}

/** Ofis ekranında: kurulmuş şirketin portresini ve logosunu değiştirme. */
export function Appearance({
  character,
  logo,
  portraitUrl,
  logoUrl,
  onState,
  notify,
}: {
  character: CharacterSpec;
  logo: LogoSpec;
  portraitUrl: string | null;
  logoUrl: string | null;
  onState: (s: any) => void;
  notify: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [gen, setGen] = useState<{ enabled: boolean; remaining: Record<Kind, number> } | null>(null);
  useEffect(() => {
    if (open && !gen) apiFetch("/api/generate").then(setGen).catch(() => setGen({ enabled: false, remaining: { portrait: 0, logo: 0 } }));
  }, [open, gen]);

  async function apply(kind: Kind, body: object) {
    const r = await apiFetch("/api/company/appearance", { method: "POST", body: JSON.stringify({ kind, ...body }) });
    onState(r.state);
    notify(r.message);
  }
  async function draw(kind: Kind) {
    setBusy(kind);
    try {
      const a = await apiFetch<Asset>("/api/generate", { method: "POST", body: JSON.stringify(kind === "portrait" ? { kind, character } : { kind, logo }) });
      await apply(kind, { assetId: a.id });
      setGen((g) => (g ? { ...g, remaining: { ...g.remaining, [kind]: Math.max(0, g.remaining[kind] - 1) } } : g));
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!open)
    return (
      <section className="card flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-sm text-mute">Portren ve logon profilinde, akışta ve postada görünür.</span>
        <button className="btn shrink-0 !py-1.5 text-xs" onClick={() => setOpen(true)}>
          Değiştir
        </button>
      </section>
    );

  const row = (kind: Kind) => (
    <div className="flex flex-wrap items-center gap-3">
      <div className="shrink-0 overflow-hidden rounded-sm border border-line">
        {kind === "portrait" ? <Portrait spec={character} url={portraitUrl} size={56} /> : <div className="p-1"><CompanyMark spec={logo} url={logoUrl} size={48} /></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <UploadButton kind={kind} notify={notify} disabled={busy !== null} label={kind === "portrait" ? "Fotoğraf yükle" : "Logo yükle"} onUploaded={(a) => apply(kind, { assetId: a.id }).catch((e) => notify(e.message))} />
        {gen?.enabled && (
          <button className="btn !py-2" disabled={busy !== null || (gen.remaining[kind] ?? 0) < 1} onClick={() => draw(kind)}>
            {busy === kind ? "Çiziliyor…" : `PixelLab ile çizdir (${gen.remaining[kind]} hak)`}
          </button>
        )}
        {(kind === "portrait" ? portraitUrl : logoUrl) && (
          <button className="text-xs text-mute underline-offset-4 hover:text-white hover:underline" onClick={() => apply(kind, { reset: true }).catch((e) => notify(e.message))}>
            Sade çizime dön
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif font-semibold">Portre ve logo</h3>
        <button className="text-xs text-mute hover:text-white" onClick={() => setOpen(false)}>
          Kapat
        </button>
      </div>
      {row("portrait")}
      {row("logo")}
      <p className="text-xs text-mute">PNG, JPEG ya da WebP, en fazla 1 MB. Uygunsuz görseller yönetici tarafından kaldırılabilir.</p>
    </section>
  );
}
