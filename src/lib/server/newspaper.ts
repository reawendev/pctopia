// PCTopia Gazetesi — YALNIZCA SUNUCU.
//
// Her gün (İstanbul saatiyle) bir sayı. İçerik o günün sosyal medya haberlerinden, borsadan ve sıralamadan derlenir:
// en önemli olay manşet olur, diğerleri bölümlere ayrılır. Ayrı bir tablo ya da zamanlayıcı gerekmez.

import { STOCKS } from "../game/market";
import { isMissingTable } from "./company";
import { recentEvents } from "./events";
import { currentTick, priceAt } from "./market";
import { rankCompanies } from "./ranking";
import { loadSeasons } from "./seasons";
import { db, HttpError } from "./supabase";

export type Section = "Ekonomi" | "Teknoloji" | "Kulis" | "Magazin" | "Tüketici";

/** Haber türü → bölüm, önem ve gazete başlığı. {c} şirketin adı. */
const DESK: Record<string, { section: Section; weight: number; title: string }> = {
  scandal: { section: "Kulis", weight: 10, title: "Skandal: {c} köşeye sıkıştı" },
  blackmail_caught: { section: "Kulis", weight: 11, title: "Şantajcı suçüstü yakalandı: {c}" },
  scandal_self: { section: "Kulis", weight: 8, title: "{c} şantajcısını ihbar etti" },
  blackmail_unknown: { section: "Kulis", weight: 7, title: "İsimsiz zarf yetkililerde" },
  blackmail_standoff: { section: "Kulis", weight: 5, title: "Sessiz dosya savaşı" },
  op_caught: { section: "Kulis", weight: 9, title: "Casusluk skandalı: {c} yakalandı" },
  smear: { section: "Kulis", weight: 5, title: "{c} hakkında şok iddialar" },
  fake_reviews: { section: "Tüketici", weight: 4, title: "{c} ürünlerine yorum yağmuru" },
  leak_cover: { section: "Kulis", weight: 8, title: "{c} sızıntıyı örtbas etmeye çalıştı" },
  leak_open: { section: "Teknoloji", weight: 5, title: "{c} veri sızıntısını açıkladı" },
  ransomware: { section: "Teknoloji", weight: 6, title: "{c} fidye yazılımının hedefinde" },
  recall_bad: { section: "Tüketici", weight: 7, title: "Arıza skandalı: {c} sessiz kaldı" },
  recall_good: { section: "Tüketici", weight: 4, title: "{c} arızalı partiyi geri çağırdı" },
  strike: { section: "Ekonomi", weight: 6, title: "{c} çalışanları iş bıraktı" },
  grey_market: { section: "Ekonomi", weight: 6, title: "{c} depolarında kayıt dışı parça" },
  tax_fine: { section: "Ekonomi", weight: 6, title: "{c} için ağır vergi cezası" },
  ipo: { section: "Ekonomi", weight: 9, title: "{c} borsada: halka arz tamamlandı" },
  bid_won: { section: "Ekonomi", weight: 7, title: "{c} ihaleyi kaptı" },
  tender_won: { section: "Ekonomi", weight: 5, title: "{c} kamu ihalesini kazandı" },
  bid_failed: { section: "Ekonomi", weight: 8, title: "{c} teslimatta çuvalladı" },
  bank_default: { section: "Ekonomi", weight: 8, title: "{c} kredisini ödeyemedi" },
  deal_default: { section: "Ekonomi", weight: 7, title: "Borç krizi: {c} ödemedi" },
  deal_signed: { section: "Ekonomi", weight: 3, title: "{c} yeni bir anlaşmaya imza attı" },
  facility: { section: "Ekonomi", weight: 5, title: "{c} büyüyor: yeni tesis açıldı" },
  patent: { section: "Teknoloji", weight: 6, title: "Patent {c} şirketinde" },
  soldout: { section: "Teknoloji", weight: 4, title: "Raflar boş: {c} stok yetiştiremiyor" },
  milestone: { section: "Teknoloji", weight: 3, title: "{c} satış rekoru kırıyor" },
  bottleneck: { section: "Tüketici", weight: 2, title: "Test masasında {c}: denge sorunu" },
  price_fahis: { section: "Tüketici", weight: 4, title: "Haftanın fahiş etiketi {c} şirketinden" },
  price_pahali: { section: "Tüketici", weight: 2, title: "{c} fiyatları tartışılıyor" },
  price_uygun: { section: "Tüketici", weight: 3, title: "Fiyat/performans önerisi: {c}" },
  below_cost: { section: "Ekonomi", weight: 3, title: "{c} maliyetin altında satıyor" },
  gambling_loss: { section: "Magazin", weight: 6, title: "{c} patronu kumarda servet kaybetti" },
  gambling_win: { section: "Magazin", weight: 4, title: "{c} patronu masayı patlattı" },
  wedding: { section: "Magazin", weight: 6, title: "Yılın düğünü: {c} patronu evlendi" },
  engaged: { section: "Magazin", weight: 4, title: "{c} patronu nişanlandı" },
  rejected: { section: "Magazin", weight: 3, title: "{c} patronuna ret" },
  breakup: { section: "Magazin", weight: 3, title: "{c} patronu ayrıldı" },
  dating: { section: "Magazin", weight: 2, title: "{c} patronunun yeni aşkı" },
  luxury: { section: "Magazin", weight: 2, title: "{c} patronundan lüks alışveriş" },
};

const SECTIONS: Section[] = ["Ekonomi", "Kulis", "Teknoloji", "Tüketici", "Magazin"];
const PER_SECTION = 4;
const DAY_MS = 86_400_000;
const TR_OFFSET = 3 * 3_600_000;

/** İstanbul gece yarısı (UTC ms). offset: 0 bugün, 1 dün… */
export function dayStart(now: number, offset = 0): number {
  return Math.floor((now + TR_OFFSET) / DAY_MS) * DAY_MS - TR_OFFSET - offset * DAY_MS;
}

type Co = { id: string; name: string; founderName: string; logo: unknown; logoUrl: string | null; portraitUrl: string | null; character: unknown };
export type Story = { id: number; section: Section; title: string; text: string; at: string; weight: number; company: Co | null; repDelta: number };

const cache = new Map<number, { at: number; data: any }>();
const CACHE_MS = 60_000;

export async function edition(offset: number, now = Date.now()) {
  const from = dayStart(now, offset);
  const to = Math.min(from + DAY_MS, now);
  const key = from;
  const hit = cache.get(key);
  // Geçmiş sayılar değişmez; bugünkü dakikada bir tazelenir
  if (hit && (offset > 0 || now - hit.at < CACHE_MS)) return hit.data;

  const { data: posts, error } = await db()
    .from("social_posts")
    .select("*")
    .gte("created_at", new Date(from).toISOString())
    .lt("created_at", new Date(to).toISOString())
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) {
    if (isMissingTable(error)) return { ready: false as const };
    throw new HttpError(500, error.message);
  }

  const ids = Array.from(new Set((posts ?? []).map((p) => p.company_id).filter(Boolean)));
  const people = new Map<string, Co>();
  if (ids.length) {
    const { data } = await db().from("companies").select("id, name, founder_name, logo, logo_url, portrait_url, character").in("id", ids);
    for (const c of data ?? []) people.set(c.id, { id: c.id, name: c.name, founderName: c.founder_name, logo: c.logo, logoUrl: c.logo_url ?? null, portraitUrl: c.portrait_url ?? null, character: c.character });
  }

  // Haberler: aynı şirketin aynı türdeki haberi bir kez
  const seen = new Set<string>();
  const stories: Story[] = [];
  for (const p of posts ?? []) {
    const desk = DESK[p.event];
    if (!desk || p.kind === "player") continue;
    const k = `${p.event}:${p.company_id ?? "-"}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const co = p.company_id ? people.get(p.company_id) ?? null : null;
    stories.push({
      id: p.id,
      section: desk.section,
      title: desk.title.replace("{c}", co?.name ?? "Bir şirket"),
      text: p.text,
      at: p.created_at,
      // Büyük itibar etkisi haberi öne çıkarır
      weight: desk.weight + Math.min(3, Math.abs(Number(p.rep_delta ?? 0)) / 2),
      company: co,
      repDelta: Number(p.rep_delta ?? 0),
    });
  }
  stories.sort((a, b) => b.weight - a.weight || (a.at < b.at ? 1 : -1));
  const headline = stories[0] ?? null;
  const rest = stories.slice(1);
  const sections = SECTIONS.map((s) => ({ name: s, stories: rest.filter((x) => x.section === s).slice(0, PER_SECTION) })).filter((s) => s.stories.length);

  // Okur köşesi: günün en çok beğenilen oyuncu paylaşımı
  const playerPosts = (posts ?? []).filter((p) => p.kind === "player");
  let quote: { text: string; author: string; company: Co | null; likes: number } | null = null;
  if (playerPosts.length) {
    const { data: likes } = await db().from("post_likes").select("post_id").in("post_id", playerPosts.map((p) => p.id));
    const count = new Map<number, number>();
    for (const l of likes ?? []) count.set(l.post_id, (count.get(l.post_id) ?? 0) + 1);
    const best = playerPosts.slice().sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || (a.created_at < b.created_at ? 1 : -1))[0];
    quote = { text: best.text, author: best.author, company: best.company_id ? people.get(best.company_id) ?? null : null, likes: count.get(best.id) ?? 0 };
  }

  // Borsa: günün sonunda (bugün için şu an) 24 saatlik değişim
  const tickEnd = currentTick(to);
  const tickStart = currentTick(to - DAY_MS);
  const movers = STOCKS.map((s) => {
    const p1 = priceAt(s.id, tickEnd);
    const p0 = priceAt(s.id, tickStart);
    return { id: s.id, name: s.name, price: p1, change: p0 > 0 ? p1 / p0 - 1 : 0 };
  }).sort((a, b) => b.change - a.change);

  // Sıralama (her zaman güncel)
  const ranked = await rankCompanies();
  const top = ranked.slice(0, 5).map((r) => ({ id: r.id, rank: r.rank, name: r.name, founderName: r.founderName, netWorth: r.netWorth, reputation: r.reputation, logo: r.logo, logoUrl: r.logoUrl }));

  // Sayı numarası: sezonun başından bu yana gün
  const seasons = await loadSeasons().catch(() => null);
  const seasonStart = seasons?.current ? dayStart(new Date(seasons.current.started_at).getTime()) : from;
  const number = Math.max(1, Math.round((from - seasonStart) / DAY_MS) + 1);

  // O günün dünya gündemi (8 saatlik dilimler)
  const agenda = recentEvents(3, to - 1)
    .filter((e) => e.id !== "calm" && e.endsAt > from)
    .map((e) => ({ title: e.title, text: e.text }));

  const data = {
    ready: true as const,
    date: from,
    today: offset === 0,
    number,
    season: seasons?.current?.number ?? null,
    headline,
    sections,
    quote,
    market: { gainers: movers.slice(0, 3), losers: movers.slice(-3).reverse() },
    top,
    agenda,
    count: stories.length,
  };
  if (cache.size > 20) cache.clear();
  cache.set(key, { at: now, data });
  return data;
}
