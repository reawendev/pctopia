"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { formatMoney } from "@/lib/game/economy";
import {
  ACTIVITIES, PERK_BASE, PERK_TEXT, PROPOSE_MIN, proposalChance, stageRank, STAGE_LABEL, type Npc, type Perk, type StageId,
} from "@/lib/game/life";
import { apiFetch } from "@/lib/supabase/client";
import { SkeletonCard } from "./Skeleton";

type Person = {
  npc: Npc;
  affection: number;
  stage: StageId;
  stageLabel: string;
  engaged: boolean;
  married: boolean;
  readyAt: number;
};
type LifeData = {
  ready: boolean;
  costs?: { meet: number; ring: number; wedding: number; activities: Record<string, number> };
  perks?: Record<Perk, number>;
  meetReadyAt?: number;
  firstMeetFree?: boolean;
  unmet?: number;
  people?: Person[];
  serverTime?: number;
  message?: string;
  state?: unknown;
  journal?: unknown;
};

const STAGE_TONE: Record<StageId, string> = {
  tanisik: "text-mute",
  arkadas: "text-white",
  flort: "text-amber-soft",
  sevgili: "text-amber",
  nisanli: "text-amber",
  evli: "text-gain",
};

function wait(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
}

export function Life({ cash, now, onState, notify }: { cash: number; now: number; onState: (s: any) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<LifeData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((d: LifeData) => setData(d), []);

  useEffect(() => {
    apiFetch<LifeData>("/api/life").then(apply).catch((e) => notify(e.message));
  }, [apply, notify]);

  async function act(body: object) {
    setBusy(true);
    try {
      const r = await apiFetch<LifeData>("/api/life", { method: "POST", body: JSON.stringify(body) });
      apply(r);
      if (r.state) onState({ ...(r.state as object), journal: r.journal });
      if (r.message) notify(r.message);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <SkeletonCard label="Ajandan açılıyor…" />;
  if (!data.ready) return <div className="card p-4 text-sm text-mute">Hayat için veritabanında <code className="text-white">005_atolye_sosyal_hayat.sql</code> çalıştırılmalı.</div>;

  const t = now; // sayfadan gelen, sunucu saatine göre düzeltilmiş an
  const people = data.people ?? [];
  const partner = people.find((p) => p.married || p.engaged || stageRank(p.stage) >= stageRank("flort"));
  const perks = data.perks!;
  const activePerks = (Object.keys(perks) as Perk[]).filter((k) => perks[k] > 0);
  const meetIn = (data.meetReadyAt ?? 0) - t;
  const selected = people.find((p) => p.npc.id === sel) ?? null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <section className="card flex items-center gap-3 p-4">
          {partner ? (
            <>
              <div className="shrink-0 overflow-hidden rounded-sm border border-amber/50">
                <Avatar spec={partner.npc.look} size={56} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-mute">{partner.married ? "Eşin" : partner.engaged ? "Nişanlın" : partner.stage === "sevgili" ? "Sevgilin" : "Flörtün"}</div>
                <div className="heading truncate text-lg">{partner.npc.name}</div>
                <div className="text-xs text-mute">{partner.npc.job}</div>
              </div>
            </>
          ) : (
            <p className="text-sm text-mute">Şu an bir ilişkin yok. Davetlerde insanlarla tanış, birlikte vakit geçir.</p>
          )}
        </section>
        <section className="card p-4">
          <div className="text-xs text-mute">Çevrenden gelen yararlar</div>
          {activePerks.length === 0 ? (
            <p className="mt-1 text-sm text-mute">Arkadaş olduğun kişilerin mesleği şirketine katkı sağlar.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {activePerks.map((k) => (
                <li key={k} className="text-gain">
                  {PERK_TEXT[k](perks[k])}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <div className="font-medium">Bir davete katıl</div>
          <div className="text-mute">
            {data.unmet === 0 ? "Şehirdeki herkesle tanıştın." : `Yeni biriyle tanışırsın. Henüz tanımadığın ${data.unmet} kişi var.`}
          </div>
        </div>
        <button className="btn btn-primary !py-2" disabled={busy || data.unmet === 0 || meetIn > 0 || (!data.firstMeetFree && cash < (data.costs?.meet ?? 0))} onClick={() => act({ action: "meet" })}>
          {meetIn > 0 ? `${wait(meetIn)} sonra` : data.firstMeetFree ? "Kafeye uğra (ücretsiz)" : `Davete git, ${formatMoney(data.costs!.meet)}`}
        </button>
      </section>

      {people.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className="card divide-y divide-line self-start">
            {people.map((p) => (
              <li key={p.npc.id}>
                <button onClick={() => setSel(p.npc.id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${sel === p.npc.id ? "bg-amber/[0.07]" : "hover:bg-raised"}`}>
                  <div className="shrink-0 overflow-hidden rounded-sm">
                    <Avatar spec={p.npc.look} size={44} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{p.npc.name}</span>
                      <span className={`shrink-0 text-xs ${STAGE_TONE[p.stage]}`}>{p.stageLabel}</span>
                    </div>
                    <div className="truncate text-xs text-mute">
                      {p.npc.job}, {p.npc.age}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink" aria-label={`Yakınlık ${p.affection}`}>
                      <div className={`h-full rounded-full ${p.married ? "bg-gain" : "bg-amber"}`} style={{ width: `${p.affection}%` }} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <PersonPane p={selected} t={t} cash={cash} costs={data.costs!} busy={busy} act={act} hasOtherPartner={!!partner && partner.npc.id !== selected.npc.id} />
          ) : (
            <div className="card hidden p-6 text-center text-sm text-mute lg:block">Bir kişi seç.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PersonPane({
  p,
  t,
  cash,
  costs,
  busy,
  act,
  hasOtherPartner,
}: {
  p: Person;
  t: number;
  cash: number;
  costs: NonNullable<LifeData["costs"]>;
  busy: boolean;
  act: (b: object) => void;
  hasOtherPartner: boolean;
}) {
  const cooldown = p.readyAt - t;
  const romantic = p.married || p.engaged || stageRank(p.stage) >= stageRank("flort");
  const perkMult = stageRank(p.stage) >= stageRank("sevgili") ? 2 : stageRank(p.stage) >= stageRank("arkadas") ? 1 : 0;

  return (
    <section className="card self-start p-4">
      <div className="flex gap-3">
        <div className="shrink-0 overflow-hidden rounded-sm border border-line">
          <Avatar spec={p.npc.look} size={72} />
        </div>
        <div className="min-w-0">
          <h3 className="heading text-lg">{p.npc.name}</h3>
          <div className="text-sm text-mute">
            {p.npc.job}, {p.npc.age} yaşında
          </div>
          <div className={`text-sm ${STAGE_TONE[p.stage]}`}>
            {STAGE_LABEL[p.stage]}, yakınlık {p.affection}/100
          </div>
        </div>
      </div>
      <p className="mt-3 font-serif text-[15px] italic text-white/85">{p.npc.bio}</p>
      <p className="mt-2 text-xs text-mute">
        Sever: {p.npc.likes.join(", ")}. Sevmez: {p.npc.dislikes}.
      </p>
      <p className={`mt-1 text-xs ${perkMult ? "text-gain" : "text-mute"}`}>
        {PERK_TEXT[p.npc.perk](PERK_BASE[p.npc.perk] * Math.max(1, perkMult))}
        {perkMult === 0 ? " (arkadaş olunca)" : perkMult === 2 ? " (partner: iki kat)" : ""}
      </p>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 text-xs text-mute">{cooldown > 0 ? `${p.npc.name.split(" ")[0]} ${wait(cooldown)} sonra müsait` : "Birlikte ne yapalım?"}</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ACTIVITIES.map((a) => {
            const locked = stageRank(p.stage) < stageRank(a.minStage);
            const cost = costs.activities[a.id];
            const liked = a.tag && p.npc.likes.includes(a.tag);
            const disliked = a.tag && p.npc.dislikes === a.tag;
            return (
              <button
                key={a.id}
                className={`rounded border px-2 py-1.5 text-left text-xs leading-tight transition-colors enabled:hover:border-amber disabled:opacity-40 ${liked ? "border-gain/40" : disliked ? "border-loss/40" : "border-line"}`}
                disabled={busy || cooldown > 0 || locked || cash < cost}
                onClick={() => act({ action: "activity", npcId: p.npc.id, activityId: a.id })}
                title={locked ? `En az ${STAGE_LABEL[a.minStage]} olmalısınız` : liked ? "Sevdiği bir şey" : disliked ? "Pek sevmez" : undefined}
              >
                <span className="block font-medium text-white">{a.name}</span>
                <span className="num text-mute">{locked ? STAGE_LABEL[a.minStage] : formatMoney(cost)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {hasOtherPartner && <p className="mt-3 text-xs text-mute">Başka biriyle ilişkin olduğu için bu kişiyle arkadaş kalabilirsin.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {p.stage === "sevgili" && !p.engaged && (
          <button className="btn btn-primary !py-2" disabled={busy || p.affection < PROPOSE_MIN || cash < costs.ring} onClick={() => act({ action: "propose", npcId: p.npc.id })}>
            {p.affection < PROPOSE_MIN ? `Evlenme teklifi (yakınlık ${PROPOSE_MIN} olmalı)` : `Evlenme teklif et, yüzük ${formatMoney(costs.ring)} (şans %${Math.round(proposalChance(p.affection) * 100)})`}
          </button>
        )}
        {p.engaged && !p.married && (
          <button className="btn btn-primary !py-2" disabled={busy || cash < costs.wedding} onClick={() => act({ action: "wedding", npcId: p.npc.id })}>
            Düğün yap, {formatMoney(costs.wedding)}
          </button>
        )}
        {romantic && (
          <button
            className="ml-auto text-xs text-mute underline-offset-4 hover:text-loss hover:underline"
            disabled={busy}
            onClick={() => window.confirm(`${p.npc.name} ile ${p.married ? "boşanmak" : "ayrılmak"} istediğine emin misin?`) && act({ action: "breakup", npcId: p.npc.id })}
          >
            {p.married ? "Boşan" : "Ayrıl"}
          </button>
        )}
      </div>
    </section>
  );
}
