"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCompact, formatMoney } from "@/lib/game/economy";
import { apiFetch } from "@/lib/supabase/client";
import { useRequireSession } from "@/lib/useSession";

type Player = {
  userId: string;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  banned: boolean;
  company: { id: string; name: string; founderName: string; cash: number; netWorth: number } | null;
};

type Data = { stats: { users: number; companies: number; banned: number; totalCash: number }; players: Player[] };

export default function Admin() {
  const ready = useRequireSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Data>("/api/admin/players"));
      setError("");
    } catch (e: any) {
      setError(e.status === 403 ? "Bu sayfa için yönetici yetkin yok." : e.message);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function run(body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await apiFetch("/api/admin/action", { method: "POST", body: JSON.stringify(body) });
      setMsg("İşlem tamamlandı");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function grant(p: Player) {
    const raw = window.prompt(`${p.company?.name}: eklenecek tutar (eksi değer düşer)`, "1000");
    if (raw === null) return;
    const amount = Number(raw.replace(/[.\s]/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return setMsg("Geçersiz tutar");
    run({ action: "grant", userId: p.userId, amount });
  }

  if (!ready) return null;

  const players = (data?.players ?? []).filter((p) => {
    const s = q.trim().toLowerCase();
    return !s || p.email.toLowerCase().includes(s) || p.company?.name.toLowerCase().includes(s) || p.company?.founderName.toLowerCase().includes(s);
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Yönetici Paneli</h1>
        <Link href="/oyun" className="text-sm text-mute hover:text-white">← Oyuna dön</Link>
      </div>

      {error && <p className="card p-4 text-sm text-loss">{error}</p>}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Kullanıcı" value={String(data.stats.users)} />
            <Tile label="Şirket" value={String(data.stats.companies)} />
            <Tile label="Askıda" value={String(data.stats.banned)} />
            <Tile label="Toplam nakit" value={formatCompact(data.stats.totalCash)} />
          </div>

          <input className="input mb-3" placeholder="E-posta, şirket veya kurucu ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          {msg && <p className="mb-3 text-sm text-amber">{msg}</p>}

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-mute">
                <tr>
                  <th className="p-3">Oyuncu</th>
                  <th className="p-3">Şirket</th>
                  <th className="p-3 text-right">Nakit</th>
                  <th className="p-3 text-right">Net değer</th>
                  <th className="p-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {players.map((p) => (
                  <tr key={p.userId} className={p.banned ? "opacity-60" : ""}>
                    <td className="p-3">
                      <div className="max-w-[200px] truncate">{p.email}</div>
                      <div className="text-xs text-mute">
                        {p.isAdmin && <span className="mr-2 text-amber">yönetici</span>}
                        {p.banned && <span className="text-loss">askıda</span>}
                      </div>
                    </td>
                    <td className="p-3">{p.company ? <>{p.company.name}<div className="text-xs text-mute">{p.company.founderName}</div></> : <span className="text-mute">kurulmadı</span>}</td>
                    <td className="num p-3 text-right">{p.company ? formatMoney(p.company.cash) : "—"}</td>
                    <td className="num p-3 text-right">{p.company ? formatCompact(p.company.netWorth) : "—"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        {p.company && <button className="btn !px-2.5 !py-1.5 text-xs" onClick={() => grant(p)}>Nakit</button>}
                        {!p.isAdmin && (
                          <button className="btn !px-2.5 !py-1.5 text-xs" onClick={() => run({ action: p.banned ? "unban" : "ban", userId: p.userId })}>
                            {p.banned ? "Aç" : "Askıya al"}
                          </button>
                        )}
                        {p.company && !p.isAdmin && (
                          <button className="btn !px-2.5 !py-1.5 text-xs text-loss" onClick={() => run({ action: "deleteCompany", userId: p.userId }, `${p.company!.name} silinsin mi? Bu geri alınamaz.`)}>
                            Şirketi sil
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {players.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-mute">Sonuç yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className="num mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
