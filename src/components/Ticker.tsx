"use client";

import { useEffect, useState } from "react";
import { formatPct, formatPrice } from "@/lib/game/market";
import { apiFetch } from "@/lib/supabase/client";

type Quote = { id: string; price: number; change24h: number };
type News = { stockId: string; dir: 1 | -1; text: string; tick: number };

/** Ekranın üstünde akan piyasa bandı: fiyatlar ve son manşet. */
export function Ticker() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [headline, setHeadline] = useState<News | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch<{ quotes: Quote[]; news: News[] }>("/api/market")
        .then((d) => {
          if (!alive) return;
          setQuotes(d.quotes);
          setHeadline(d.news[0] ?? null);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (quotes.length === 0) return <div className="h-9 border-b border-line bg-ink/80" />;

  const items = (
    <>
      {headline && (
        <span className="mr-10 text-white/90">
          <span className={headline.dir > 0 ? "text-gain" : "text-loss"}>{headline.dir > 0 ? "▲" : "▼"}</span> {headline.text}
        </span>
      )}
      {quotes.map((q) => (
        <span key={q.id} className="mr-8 whitespace-nowrap">
          <span className="font-medium text-white">{q.id}</span> <span className="num text-mute">{formatPrice(q.price)}</span>{" "}
          <span className={`num ${q.change24h >= 0 ? "text-gain" : "text-loss"}`}>{formatPct(q.change24h)}</span>
        </span>
      ))}
    </>
  );

  return (
    <div className="overflow-hidden border-b border-line bg-ink/80 text-xs" aria-label="Piyasa bandı">
      <div className="ticker-track flex w-max py-2.5 pl-4">
        <div className="flex">{items}</div>
        <div className="flex" aria-hidden="true">
          {items}
        </div>
      </div>
    </div>
  );
}
