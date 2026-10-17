// Sosyal medya akışı — YALNIZCA SUNUCU.
// Kurgusal hesaplar, oyuncuların yaptıklarına göre paylaşım yapar. Paylaşımlar şirket itibarını değiştirir.

import { isMissingTable } from "./company";
import { db } from "./supabase";

export const AUTHORS = {
  watchdog: { name: "Fiyat Avcısı", handle: "fiyatavcisi" },
  reviewer: { name: "Donanım Canavarı", handle: "donanimcanavari" },
  news: { name: "Teknoloji Gündemi", handle: "teknogundem" },
  gossip: { name: "Magazin Ekspres", handle: "magazinekspres" },
  business: { name: "Piyasa Kulisi", handle: "piyasakulisi" },
} as const;

type AuthorId = keyof typeof AUTHORS;

type EventDef = { author: AuthorId; rep: number; texts: string[] };

export const EVENTS = {
  // Not: Türkçe ekler isme göre değiştiği için değişkenlerden sonra ek kullanılmaz.
  price_fahis: {
    author: "watchdog",
    rep: -5,
    texts: [
      "{company}, “{model}” için {price} istiyor. Bu donanımın piyasa değeri {fair}. Bu fiyata kimse almaz.",
      "Haftanın fahiş etiketi: {company} “{model}”, tam {price}. Aynı parçaların piyasa değeri {fair}.",
    ],
  },
  price_pahali: {
    author: "watchdog",
    rep: -2,
    texts: [
      "{company} “{model}” modelinin etiketi {price}. Benzer sistemler {fair} civarında. Biraz pahalı.",
      "“{model}” fena değil ama {price} çok. Piyasa değeri {fair}. {company}, biraz insaf.",
    ],
  },
  price_uygun: {
    author: "reviewer",
    rep: 2,
    texts: [
      "“{model}” ({segment} sınıfı) etiketi: {price}. Bu donanım için gerçekten iyi fiyat. Tebrikler {company}.",
      "Fiyat/performans önerisi: {company} “{model}”, {price}. Piyasa değeri {fair}.",
    ],
  },
  below_cost: {
    author: "business",
    rep: 1,
    texts: ["{company}, “{model}” modelini maliyetinin altında satıyor gibi görünüyor. Pazar payı mı kovalıyorlar?"],
  },
  bottleneck: {
    author: "reviewer",
    rep: -1,
    texts: ["“{model}” incelemesi ({company}): işlemci ile ekran kartı arasında ciddi denge sorunu var."],
  },
  milestone: {
    author: "news",
    rep: 1,
    texts: ["{company}, “{model}” modelinde {count} adet satışı geride bıraktı.", "“{model}” satış listelerinde yükseliyor. {company} {count} adedi geçti."],
  },
  soldout: {
    author: "news",
    rep: 2,
    texts: ["“{model}” tükendi! {company} stok yetiştiremiyor.", "{company} “{model}” stoklarını eritti. Yeni parti ne zaman?"],
  },
  dating: {
    author: "gossip",
    rep: 0,
    texts: ["{founder} ({company}) ve {npc} birlikte görüntülendi. Aşk mı, iş birliği mi?", "Kulis: {company} patronu {founder} ile {npc} arasında yeni bir ilişki var."],
  },
  engaged: {
    author: "gossip",
    rep: 2,
    texts: ["{founder} ve {npc} nişanlandı! Yüzüğün fiyatını {company} muhasebesi bile bilmiyor.", "Sürpriz teklif: {founder} evlenme teklif etti, {npc} evet dedi."],
  },
  rejected: {
    author: "gossip",
    rep: -1,
    texts: ["{npc}, {founder} tarafından yapılan evlenme teklifini geri çevirdi. {company} ofisinde moraller bozuk."],
  },
  wedding: {
    author: "gossip",
    rep: 3,
    texts: ["{founder} ve {npc} görkemli bir törenle evlendi. Davetliler arasında iş dünyasının tanınan isimleri vardı.", "Yılın düğünü: {company} kurucusu {founder} ve {npc} dünyaevine girdi."],
  },
  breakup: {
    author: "gossip",
    rep: 0,
    texts: ["{founder} ve {npc} yollarını ayırdı. Taraflar açıklama yapmadı."],
  },
  ransomware: {
    author: "news",
    rep: -2,
    texts: ["{company} sistemlerinin fidye yazılımı saldırısına uğradığı ortaya çıktı."],
  },
  tender_won: {
    author: "business",
    rep: 2,
    texts: ["Belediyenin okul laboratuvarları ihalesini {company} kazandı."],
  },
} satisfies Record<string, EventDef>;

export type EventId = keyof typeof EVENTS;

function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/**
 * Paylaşım yapar ve itibarı günceller. Olumlu paylaşımlara "basın" yararı eklenir.
 * Tablo yoksa (göç yapılmadıysa) sessizce geçer.
 */
export async function postAbout(
  companyId: string,
  event: EventId,
  vars: Record<string, string | number>,
  pressBonus = 0
): Promise<void> {
  const def: EventDef = EVENTS[event];
  const text = fill(def.texts[Math.floor(Math.random() * def.texts.length)], vars);
  const rep = def.rep > 0 ? def.rep + Math.round(pressBonus) : def.rep;
  const author = AUTHORS[def.author];
  const { error } = await db()
    .from("social_posts")
    .insert({ company_id: companyId, event, author: author.name, handle: author.handle, text, rep_delta: rep });
  if (error) {
    if (!isMissingTable(error)) console.error("postAbout", error.message);
    return;
  }
  if (rep !== 0) {
    const { error: e2 } = await db().rpc("adjust_reputation", { p_company: companyId, p_delta: rep });
    if (e2) console.error("adjust_reputation", e2.message);
  }
}
