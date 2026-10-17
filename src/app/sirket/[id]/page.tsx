"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Feed } from "@/components/Feed";
import { CompanyMark, Portrait } from "@/components/Portrait";
import type { CharacterSpec, LogoSpec } from "@/lib/game/config";
import { formatCompactMoney, formatMoney } from "@/lib/game/economy";
import { stageFor } from "@/lib/game/stages";
import { apiFetch } from "@/lib/supabase/client";
import { useRequireSession } from "@/lib/useSession";

type Profile = {
  isMe: boolean;
  company: { id: string; name: string; founderName: string; logo: LogoSpec; logoUrl: string | null; portraitUrl: string | null; character: CharacterSpec; createdAt: string | null; reputation: number };
  rank: number;
  total: number;
  netWorth: number;
  products: { id: string; name: string; price: number; fair: number; verdict: string; segment: string; inStock: boolean; sold: number }[];
  belongings: string[];
  partner: { name: string; job: string; stage: string; look: CharacterSpec } | null;
  friends: number;
  staff: string[];
};

const VERDICT_TONE: Record<string, string> = { kelepir: "text-gain", uygun: "text-gain", piyasa: "text-white", pahalı: "text-amber", fahiş: "text-loss" };

function founded(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function SirketProfili({ params }: { params: { id: string } }) {
  const ready = useRequireSession();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ready) return;
    apiFetch<Profile>(`/api/profile?id=${encodeURIComponent(params.id)}`).then(setP).catch((e) => setError(e.message));
  }, [ready, params.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const back = (
    <Link href="/oyun" className="text-sm text-mute hover:text-white">
      Ofise dön
    </Link>
  );

  if (error)
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        {back}
        <div className="card p-5 text-sm text-loss">{error}</div>
      </main>
    );
  if (!p) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-mute">Sicil kaydı açılıyor…</main>;

  const c = p.company;
  const career = stageFor(p.netWorth);
  const rep = c.reputation;

  return (
    <main className="mx-auto max-w-4xl space-y-3 px-4 py-6">
      <div className="flex items-center justify-between">{back}</div>

      {/* Künye */}
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="shrink-0 self-start overflow-hidden rounded-sm border border-amber/50">
            <Portrait spec={c.character} url={c.portraitUrl} size={112} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CompanyMark spec={c.logo} url={c.logoUrl} size={28} title={c.name} />
              <h1 className="truncate font-serif text-2xl font-semibold">{c.name}</h1>
            </div>
            <p className="mt-1 text-[15px]">
              {c.founderName}, <span className="text-amber-soft">{career.stage.title}</span>
            </p>
            <p className="mt-1 text-sm text-mute">
              {founded(c.createdAt) ? `${founded(c.createdAt)} tarihinde kuruldu. ` : ""}
              Sektör sıralamasında {p.total} şirket arasında {p.rank}. sırada.
            </p>
            {!p.isMe ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/oyun?kime=${c.id}`} className="btn !py-1.5 text-sm">
                  Posta gönder
                </Link>
                <Link href={`/oyun?anlasma=${c.id}`} className="btn btn-primary !py-1.5 text-sm">
                  Anlaşma teklif et
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-xs text-mute">Bu senin şirketin. Diğer oyuncular profilini böyle görüyor.</p>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-px border-t border-line bg-line">
          <div className="bg-panel px-4 py-3">
            <dt className="text-xs text-mute">Net değer</dt>
            <dd className="num text-lg">{formatCompactMoney(p.netWorth)}</dd>
          </div>
          <div className="bg-panel px-4 py-3">
            <dt className="text-xs text-mute">İtibar</dt>
            <dd className={`num text-lg ${rep >= 65 ? "text-gain" : rep < 40 ? "text-loss" : ""}`}>{rep} / 100</dd>
          </div>
          <div className="bg-panel px-4 py-3">
            <dt className="text-xs text-mute">Sıra</dt>
            <dd className="num text-lg">
              {p.rank}
              <span className="text-sm text-mute"> / {p.total}</span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {/* Ürünler */}
          <section className="card">
            <h2 className="border-b border-line px-4 py-2.5 font-serif font-semibold">Piyasadaki ürünleri</h2>
            {p.products.length === 0 ? (
              <p className="px-4 py-3 text-sm text-mute">Şu an satışta toplama PC'si yok.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.products.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-mute">
                        {m.segment} sınıfı, {m.sold} adet satıldı{m.inStock ? "" : ", stok tükendi"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-sm">{formatMoney(m.price)}</div>
                      <div className={`text-xs ${VERDICT_TONE[m.verdict] ?? "text-mute"}`}>{m.verdict}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Akış */}
          <div>
            <h2 className="mb-2 px-1 font-serif font-semibold">Hakkında konuşulanlar</h2>
            <Feed now={now} scope="company" companyId={c.id} compact />
          </div>
        </div>

        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className="font-serif font-semibold">Özel hayatı</h2>
            {p.partner ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="shrink-0 overflow-hidden rounded-full border border-line">
                  <Avatar spec={p.partner.look} size={48} />
                </div>
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{p.partner.name}</div>
                  <div className="text-mute">
                    {p.partner.job}, {p.partner.stage.toLocaleLowerCase("tr")}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-mute">Bilinen bir ilişkisi yok.</p>
            )}
            {p.friends > 0 && <p className="mt-2 text-sm text-mute">Çevresinde {p.friends} yakın tanıdık var.</p>}
          </section>

          <section className="card p-4">
            <h2 className="font-serif font-semibold">Ekibi</h2>
            {p.staff.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {p.staff.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mute">İşleri tek başına yürütüyor.</p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-serif font-semibold">Mülkleri</h2>
            {p.belongings.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {p.belongings.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mute">Gösterişten uzak duruyor.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
