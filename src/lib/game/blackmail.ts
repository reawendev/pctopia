// Kozlar ve şantaj: kurallar ve sabitler (istemci + sunucu).
//
// Sır (secret): bir şirketin kamuoyunun bilmediği kirli işi. Örtbas edilen krizler ve yakalanmadan yürütülen
// gizli operasyonlar sır bırakır. Sırrın dosyası (dossier) özel dedektifle ya da casuslukla ele geçirilir.
// Dosyayı tutan, sırrın sahibine şantaj yapabilir: para, hisse ya da ihaleden çekilme ister.

export type Severity = 1 | 2 | 3;

export const SEVERITY: Record<Severity, { label: string; share: number; rep: number; demand: number; hours: number; sendCatch: number }> = {
  1: { label: "hafif", share: 0.02, rep: 3, demand: 0.1, hours: 4, sendCatch: 0.08 },
  2: { label: "ciddi", share: 0.05, rep: 6, demand: 0.2, hours: 8, sendCatch: 0.12 },
  3: { label: "yıkıcı", share: 0.1, rep: 10, demand: 0.3, hours: 12, sendCatch: 0.16 },
};

/** Sırrın ömrü: 24 saat taze, sonra değeri düşer, 72 saatte bayatlar. */
export const SECRET_LIFE_HOURS = 72;
export const FRESH_HOURS = 24;
export const STALE_FLOOR = 0.4;

/** Hedefin yanıt süresi. Yanıtsız kalan şantaj ret sayılır: dosya basına sızar. */
export const ANSWER_HOURS = 24;
/** Yeni kurulan şirketler bu süre şantajdan korunur. */
export const PROTECT_HOURS = 48;
/** Şantajcı başına sınır. */
export const BLACKMAIL_WINDOW_HOURS = 12;
export const BLACKMAILS_PER_WINDOW = 2;
/** İstenen tutar, dosyanın değerinin en fazla bu katı olabilir. */
export const MAX_GREED = 3;
export const MIN_DEMAND = 500;

/** Yakalanma */
export const CAUGHT_REP = 10;
export const BAN_HOURS = 24;
export const REPORT_CATCH = 0.65;
export const SERIAL_BONUS = 0.15;
export const SERIAL_HOURS = 72;
export const MAX_SEND_CATCH = 0.5;
export const MAX_REPORT_CATCH = 0.9;
/** Ödeme alındıktan sonra şantajcının elinde kopya kalma olasılığı (hedef bilmez). */
export const COPY_KEEP = 0.3;
export const COPY_COOLDOWN_HOURS = 24;

export type DemandKind = "cash" | "shares" | "tender";
export const DEMAND_LABEL: Record<DemandKind, string> = { cash: "Para", shares: "Hisse devri", tender: "İhaleden çekilme" };

/** Sır türleri: ağırlık, dosya özeti ve ortaya çıkınca gazete başlığı. {company} sırrın sahibi, {target} varsa mağdur. */
export const SECRET_KINDS = {
  leak_cover: { severity: 3, summary: "Müşteri verisi sızıntısını örtbas etti", headline: "{company}, müşteri verilerinin sızdığını gizlemiş. Şirket içi yazışmalar ortaya çıktı, kullanıcılar öfkeli." },
  leak_hidden: { severity: 2, summary: "Veri sızıntısını müşterilerine bildirmedi", headline: "{company} müşteri verisi sızıntısından haberdardı ama kimseye söylemedi. Belgeler basında." },
  recall_quiet: { severity: 2, summary: "Arızalı partiyi müşterilerden gizledi", headline: "{company} arızalı güç kaynaklarını biliyordu. Geri çağırma yerine sessizce tek tek değiştirmiş." },
  grey_parts: { severity: 2, summary: "Faturasız gri piyasa parçası kullandı", headline: "{company} üretim bandında faturasız parça kullanmış. Tedarik belgeleri sahte çıktı." },
  ransom_paid: { severity: 1, summary: "Fidye yazılımcılarına gizlice ödeme yaptı", headline: "{company} siber saldırganlara gizlice fidye ödemiş. Sessizlik pahalıya patlayabilir." },
  op_smear: { severity: 2, summary: "{target} şirketine karşı karalama kampanyası yürüttü", headline: "{target} hakkındaki karalama haberlerinin arkasından {company} çıktı. Ödeme dekontları ortada." },
  op_reviews: { severity: 1, summary: "{target} ürünlerine sahte yorum yağdırttı", headline: "{target} ürünlerine gelen yüzlerce kötü yorumu {company} ısmarlamış." },
  op_spy: { severity: 3, summary: "{target} şirketinin Ar-Ge dosyalarını çaldı", headline: "Endüstriyel casusluk: {company}, {target} şirketinin Ar-Ge sunucularına sızmış." },
  op_tender: { severity: 2, summary: "{target} şirketinin ihale zarfını ele geçirdi", headline: "İhale skandalı: {company}, rakibi {target} şirketinin kapalı zarfını önceden görmüş." },
  op_poach: { severity: 1, summary: "{target} şirketinin yöneticisini gizlice ayarttı", headline: "{target} şirketindeki ani istifanın arkasında {company} varmış." },
  blackmail: { severity: 3, summary: "{target} şirketine şantaj yaptı", headline: "Şantaj skandalı: {company}, {target} şirketini elindeki dosyayla tehdit etmiş." },
} as const satisfies Record<string, { severity: Severity; summary: string; headline: string }>;

export type SecretKind = keyof typeof SECRET_KINDS;

export function fillSecret(t: string, vars: { company: string; target?: string }): string {
  return t.replace(/\{company\}/g, vars.company).replace(/\{target\}/g, vars.target ?? "bir rakip");
}

/** 0 (bayat) … 1 (taze) */
export function freshness(createdAt: number, now: number): number {
  const h = (now - createdAt) / 3_600_000;
  if (h >= SECRET_LIFE_HOURS) return 0;
  if (h <= FRESH_HOURS) return 1;
  return 1 - ((1 - STALE_FLOOR) * (h - FRESH_HOURS)) / (SECRET_LIFE_HOURS - FRESH_HOURS);
}

/** Dosyanın piyasa değeri: hedefin değeri × ağırlık payı × tazelik. */
export function dossierValue(severity: Severity, targetValue: number, fresh: number): number {
  if (fresh <= 0) return 0;
  return Math.max(MIN_DEMAND, Math.round((Math.max(0, targetValue) * SEVERITY[severity].share * fresh) / 100) * 100);
}

/** Gönderirken yakalanma olasılığı: ağırlık + açgözlülük + seri şantaj. */
export function sendCatchChance(severity: Severity, demandValue: number, fair: number, serial: boolean): number {
  const greed = fair > 0 ? Math.max(0, demandValue / fair - 1) * 0.15 : 0;
  return Math.min(MAX_SEND_CATCH, SEVERITY[severity].sendCatch + greed + (serial ? SERIAL_BONUS : 0));
}

export function reportCatchChance(serial: boolean): number {
  return Math.min(MAX_REPORT_CATCH, REPORT_CATCH + (serial ? SERIAL_BONUS : 0));
}

/** Yakalanan şantajcının cezası. */
export function caughtFine(fair: number): number {
  return Math.max(2_000, Math.round(fair / 100) * 100);
}

/** Sır ortaya çıkınca: itibar kaybı, talep düşüşü. İhbarda (hedef kendisi açıkladı) yarısı. */
export function exposure(severity: Severity, selfReported: boolean) {
  const s = SEVERITY[severity];
  const k = selfReported ? 0.5 : 1;
  return { rep: -Math.max(1, Math.round(s.rep * k)), demand: -s.demand * k, hours: Math.max(2, Math.round(s.hours * k)) };
}

/** Kurucunun %51'in altına inmeden devredebileceği en fazla hisse. */
export function maxShareTransfer(founderShares: number, totalShares: number): number {
  return Math.max(0, founderShares - Math.ceil(totalShares * 0.51));
}
