"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyMark } from "./Portrait";
import type { LogoSpec } from "@/lib/game/config";
import { apiFetch } from "@/lib/supabase/client";
import { ago } from "@/lib/time";

type Post = {
  id: number;
  author: string;
  handle: string;
  text: string;
  repDelta: number;
  at: string;
  company: { id: string; name: string; logo: LogoSpec | null; logoUrl: string | null } | null;
  mine: boolean;
};

// Hesap başına sabit bir renk (profil rozeti)
const HANDLE_COLOR: Record<string, string> = {
  fiyatavcisi: "#D46A5A",
  donanimcanavari: "#6FBF8B",
  teknogundem: "#7EA6E0",
  magazinekspres: "#C98BC9",
  piyasakulisi: "#C9A24A",
};

export function Feed({ now }: { now: number }) {
  const [scope, setScope] = useState<"all" | "me">("all");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [ready, setReady] = useState(true);

  const load = useCallback(async () => {
    const r = await apiFetch<{ ready: boolean; posts: Post[] }>(`/api/social?scope=${scope}`);
    setReady(r.ready);
    setPosts(r.posts);
  }, [scope]);

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!ready) return <div className="card p-4 text-sm text-mute">Sosyal medya için veritabanında <code className="text-white">005_atolye_sosyal_hayat.sql</code> çalıştırılmalı.</div>;

  return (
    <section className="card">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {(["all", "me"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`rounded px-3 py-1.5 text-sm ${scope === s ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
            {s === "all" ? "Tüm akış" : "Hakkımda"}
          </button>
        ))}
      </div>
      {!posts ? (
        <p className="px-4 py-4 text-sm text-mute">Akış yükleniyor…</p>
      ) : posts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-mute">
          {scope === "me" ? "Henüz hakkında paylaşım yok. Bir PC modelini satışa çıkarınca ilk yorumlar gelir." : "Akış sessiz. Oyuncular ürün çıkardıkça ve hayatları değiştikçe haberler düşer."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((p) => (
            <li key={p.id} className={`flex gap-3 px-4 py-3 ${p.mine ? "bg-amber/[0.04]" : ""}`}>
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold text-ink"
                style={{ background: HANDLE_COLOR[p.handle] ?? "#93A1B5" }}
                aria-hidden="true"
              >
                {p.author.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{p.author}</span>
                  <span className="text-mute">@{p.handle}</span>
                  <span className="text-xs text-mute">{ago(now - new Date(p.at).getTime())}</span>
                </div>
                <p className="mt-0.5 text-[15px] leading-snug">{p.text}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  {p.company && (
                    <span className="inline-flex items-center gap-1.5 text-mute">
                      {p.company.logo && <CompanyMark spec={p.company.logo} url={p.company.logoUrl} size={16} />}
                      {p.company.name}
                    </span>
                  )}
                  {p.repDelta !== 0 && (
                    <span className={`num rounded border px-1.5 ${p.repDelta > 0 ? "border-gain/40 text-gain" : "border-loss/40 text-loss"}`}>
                      İtibar {p.repDelta > 0 ? "+" : "−"}
                      {Math.abs(p.repDelta)}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
