// Kariyer basamakları: net değere göre şirketin "hikâyedeki" yeri.

export type Stage = { level: number; title: string; from: number; scene: string };

export const STAGES: Stage[] = [
  { level: 1, title: "Garaj Girişimi", from: 0, scene: "Evin garajında tek masa, tek bilgisayar. Faturaları hâlâ sen kesiyorsun." },
  { level: 2, title: "Küçük İşletme", from: 10_000, scene: "Sanayide kiralık bir dükkân. İlk düzenli müşterilerin kapıda." },
  { level: 3, title: "Yerel Oyuncu", from: 100_000, scene: "Şehir merkezinde bir ofis katı. Adın yerel basında geçmeye başladı." },
  { level: 4, title: "Bölgesel Şirket", from: 1_000_000, scene: "Üç şehirde şube, bir muhasebe departmanı ve ilk yönetim toplantıların." },
  { level: 5, title: "Ulusal Marka", from: 10_000_000, scene: "Plazada kendi katın var. Rakipler hamlelerini izliyor." },
  { level: 6, title: "Holding", from: 100_000_000, scene: "Yönetim kurulu, iştirakler ve sabah gazetelerinin ekonomi sayfaları." },
  { level: 7, title: "Küresel Dev", from: 1_000_000_000, scene: "Kıtalar arası veri merkezleri. Sektörün yönünü sen belirliyorsun." },
];

export function stageFor(netWorth: number): { stage: Stage; next: Stage | null; progress: number } {
  let i = 0;
  while (i + 1 < STAGES.length && netWorth >= STAGES[i + 1].from) i++;
  const stage = STAGES[i];
  const next = STAGES[i + 1] ?? null;
  if (!next) return { stage, next, progress: 1 };
  // Logaritmik ilerleme: her basamak 10 kat olduğu için doğrusal çubuk yanıltıcı olur
  const lo = Math.log10(Math.max(stage.from, 1_000));
  const hi = Math.log10(next.from);
  const v = Math.log10(Math.max(netWorth, 1_000));
  return { stage, next, progress: Math.max(0, Math.min(1, (v - lo) / (hi - lo))) };
}

/** Kuruluştan bu yana geçen oyun günü (1'den başlar). */
export function dayNumber(createdAt: string | null | undefined, now = Date.now()): number | null {
  if (!createdAt) return null;
  return Math.max(1, Math.floor((now - new Date(createdAt).getTime()) / 86_400_000) + 1);
}
