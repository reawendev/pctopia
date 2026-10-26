"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompanyMark, Portrait } from "./Portrait";
import type { CharacterSpec, LogoSpec } from "@/lib/game/config";
import { apiFetch } from "@/lib/supabase/client";
import { ago } from "@/lib/time";
import { SkeletonLines } from "./Skeleton";

type Co = { id: string; name: string; founderName: string; logo: LogoSpec | null; logoUrl: string | null; portraitUrl: string | null; character: CharacterSpec | null };
type Comment = { id: number; text: string; at: string; company: Co; canDelete: boolean };
type Post = {
  id: number;
  kind: "npc" | "player";
  author: string;
  handle: string;
  text: string;
  repDelta: number;
  at: string;
  company: Co | null;
  mine: boolean;
  canDelete: boolean;
  likes: number;
  liked: boolean;
  comments: Comment[];
};
type Data = { ready: boolean; canPost: boolean; posts: Post[] };

// Kurgusal hesap başına sabit bir renk (profil rozeti)
const HANDLE_COLOR: Record<string, string> = {
  fiyatavcisi: "#D46A5A",
  donanimcanavari: "#6FBF8B",
  teknogundem: "#7EA6E0",
  magazinekspres: "#C98BC9",
  piyasakulisi: "#C9A24A",
};

/** scope: "all" | "me" | "company" (id ile, profil sayfası için) */
export function Feed({ now, scope: fixedScope, companyId, compact }: { now: number; scope?: "company"; companyId?: string; compact?: boolean }) {
  const [scope, setScope] = useState<"all" | "me">("all");
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const url = fixedScope === "company" ? `/api/social?scope=company&id=${companyId}` : `/api/social?scope=${scope}`;
  const load = useCallback(async () => setData(await apiFetch<Data>(url)), [url]);

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(body: object) {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/social", { method: "POST", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (e: any) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (data && !data.ready) return <div className="card p-4 text-sm text-mute">Sosyal medya için veritabanında <code className="text-white">005_atolye_sosyal_hayat.sql</code> çalıştırılmalı.</div>;

  return (
    <section className="card">
      {!fixedScope && (
        <div className="flex items-center gap-1 border-b border-line px-3 py-2">
          {(["all", "me"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`rounded px-3 py-1.5 text-sm ${scope === s ? "bg-raised text-white" : "text-mute hover:text-white"}`}>
              {s === "all" ? "Tüm akış" : "Hakkımda"}
            </button>
          ))}
        </div>
      )}

      {!fixedScope && data?.canPost && (
        <form
          className="border-b border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "post", text })) setText("");
          }}
        >
          <label htmlFor="newpost" className="sr-only">Yeni paylaşım</label>
          <textarea
            id="newpost"
            className="input min-h-[64px] resize-y !py-2 leading-snug"
            maxLength={280}
            placeholder="Sektöre bir şey söyle: yeni ürün, rakibe laf, ortaklık çağrısı…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`num text-xs ${text.length > 260 ? "text-amber" : "text-mute"}`}>{text.length} / 280</span>
            <button className="btn btn-primary !py-1.5" disabled={busy || !text.trim()}>
              Paylaş
            </button>
          </div>
        </form>
      )}
      {msg && <p className="px-4 pt-3 text-sm text-loss">{msg}</p>}

      {!data ? (
        <SkeletonLines label="Akış yükleniyor…" rows={5} />
      ) : data.posts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-mute">
          {fixedScope ? "Bu şirket hakkında henüz paylaşım yok." : scope === "me" ? "Henüz hakkında paylaşım yok." : "Akış sessiz. İlk paylaşımı sen yap."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {data.posts.map((p) => (
            <PostItem key={p.id} p={p} now={now} busy={busy} act={act} canInteract={data.canPost} compact={compact} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PostItem({ p, now, busy, act, canInteract, compact }: { p: Post; now: number; busy: boolean; act: (b: object) => Promise<boolean>; canInteract: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState("");
  const player = p.kind === "player";
  return (
    <li className={`flex gap-3 px-4 py-3 ${p.mine ? "bg-amber/[0.04]" : ""}`}>
      {player && p.company?.character ? (
        <Link href={`/sirket/${p.company.id}`} className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full border border-line">
          <Portrait spec={p.company.character} url={p.company.portraitUrl} size={36} />
        </Link>
      ) : (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold text-ink" style={{ background: HANDLE_COLOR[p.handle] ?? "#93A1B5" }} aria-hidden="true">
          {p.author.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {player && p.company ? (
            <Link href={`/sirket/${p.company.id}`} className="font-medium hover:text-amber">
              {p.author}
            </Link>
          ) : (
            <span className="font-medium">{p.author}</span>
          )}
          <span className="text-mute">@{p.handle}</span>
          <span className="text-xs text-mute">{ago(now - new Date(p.at).getTime())}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug">{p.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {p.company && !compact && (
            <Link href={`/sirket/${p.company.id}`} className="inline-flex items-center gap-1.5 text-mute hover:text-white">
              {p.company.logo && <CompanyMark spec={p.company.logo} url={p.company.logoUrl} size={16} />}
              {p.company.name}
            </Link>
          )}
          {p.repDelta !== 0 && (
            <span className={`num rounded border px-1.5 ${p.repDelta > 0 ? "border-gain/40 text-gain" : "border-loss/40 text-loss"}`}>
              İtibar {p.repDelta > 0 ? "+" : "−"}
              {Math.abs(p.repDelta)}
            </span>
          )}
          {canInteract && (
            <>
              <button disabled={busy} onClick={() => act({ action: p.liked ? "unlike" : "like", postId: p.id })} aria-pressed={p.liked} className={`num ${p.liked ? "text-amber" : "text-mute hover:text-white"}`}>
                {p.liked ? "♥" : "♡"} {p.likes || ""}
              </button>
              <button onClick={() => setOpen((v) => !v)} className="text-mute hover:text-white">
                Yorum{p.comments.length ? ` (${p.comments.length})` : ""}
              </button>
            </>
          )}
          {p.canDelete && (
            <button disabled={busy} onClick={() => window.confirm("Paylaşım silinsin mi?") && act({ action: "delete", postId: p.id })} className="text-mute hover:text-loss">
              Sil
            </button>
          )}
        </div>
        {(open || (p.comments.length > 0 && p.comments.length <= 2)) && p.comments.length > 0 && (
          <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
            {p.comments.map((cm) => (
              <li key={cm.id} className="text-sm">
                <Link href={`/sirket/${cm.company.id}`} className="font-medium hover:text-amber">
                  {cm.company.founderName || cm.company.name}
                </Link>{" "}
                <span className="break-words text-white/90">{cm.text}</span>{" "}
                <span className="text-[11px] text-mute">{ago(now - new Date(cm.at).getTime())}</span>
                {cm.canDelete && (
                  <button className="ml-2 text-[11px] text-mute hover:text-loss" disabled={busy} onClick={() => act({ action: "deleteComment", commentId: cm.id })}>
                    sil
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {open && canInteract && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "comment", postId: p.id, text: c })) setC("");
            }}
          >
            <label htmlFor={`c-${p.id}`} className="sr-only">Yorum</label>
            <input id={`c-${p.id}`} className="input !py-1.5 text-sm" maxLength={280} placeholder="Yorum yaz…" value={c} onChange={(e) => setC(e.target.value)} />
            <button className="btn !py-1.5 text-xs" disabled={busy || !c.trim()}>
              Gönder
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
