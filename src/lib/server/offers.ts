// İş teklifleri ve senaryolar — YALNIZCA SUNUCU.
//
// Her şirkete belirli aralıklarla masasına bir "e-posta" düşer: bir sözleşme, ihale, kriz ya da fırsat.
// Oyuncu bir seçenek seçer; bazı seçenekler anında, bazıları birkaç dakika sonra sonuçlanır.
// Sonuç, seçeneğin başarı olasılığına göre sunucuda zar atılarak belirlenir.
// Ödüller şirketin saatlik gelirine göre ölçeklenir, böylece her aşamada anlamlı kalır.

import { EQUIPMENT } from "../game/config";
import { formatMoney, incomePerHour, type Owned } from "../game/economy";
import { stageFor } from "../game/stages";
import { isMissingTable, logEvent } from "./company";
import { postAbout, type EventId } from "./social";
import { recordSecret } from "./blackmail";
import type { SecretKind } from "../game/blackmail";
import { addEffect, type EffectKind } from "./effects";
import { effectiveLevel } from "../game/facility";
import { currentEvent } from "./events";
import type { Perk } from "../game/life";
import { db, HttpError } from "./supabase";

export const OFFER_EVERY_MIN = 20; // yeni teklif aralığı
export const MAX_OPEN = 3; // aynı anda en fazla açık teklif
export const EXPIRE_MIN = 120; // açık teklifin ömrü

export type Choice = {
  id: string;
  label: string;
  cost: number; // kabulde peşin ödenen (teminat, satın alma)
  minutes: number; // 0: anında sonuçlanır
  p: number; // başarı olasılığı
  win: number; // başarıda kasaya eklenen (peşin maliyet dahil brüt)
  lose: number; // başarısızlıkta kasaya eklenen (eksi olabilir)
  winText: string;
  loseText: string;
  decline?: boolean; // "reddet": hiçbir şey olmaz
  rep?: { win?: number; lose?: number }; // itibar değişimi
  fx?: { win?: Fx; lose?: Fx }; // süreli etki
  post?: { win?: EventId; lose?: EventId }; // sosyal medya haberi
  risk?: number; // sekreter için: para dışı kayıpların para karşılığı (beklenen)
};

export type Fx = { kind: EffectKind; value: number; hours: number; label: string };

/** Seçeneğin para dışı sonuçlarının kısa metni (istemci için). */
function note(rep?: number, fx?: Fx): string {
  const p: string[] = [];
  if (fx) p.push(fx.label.replace(/^[^:]+:\s*/, ""));
  if (rep) p.push(`itibar ${rep > 0 ? "+" : "−"}${Math.abs(rep)}`);
  return p.join(", ");
}

type Ctx = { H: number; bonus: number; client: string; partner: string | null; model: string | null; accountant: boolean };

/** Şirketin durumu: bazı krizler yalnızca uygun koşulda çıkar. */
type Situation = { staff: number; accountant: boolean; facilityLevel: number; models: number; soldMax: number; netWorth: number };

type Template = {
  id: string;
  weight: number;
  crisis?: boolean; // görmezden gelinirse 'ignore' seçeneği uygulanır
  needsPartner?: boolean;
  when?: (s: Situation) => boolean;
  build: (c: Ctx) => { sender: string; subject: string; body: string; choices: Choice[] };
};

const CLIENTS = [
  "Kervan Lojistik",
  "Anka Otomotiv",
  "Mavi Tersane",
  "Nabız Telekom",
  "Atlas Enerji",
  "Sedir Hukuk Bürosu",
  "Kardelen Gıda",
  "Poyraz Yapı",
  "Lale Sağlık Grubu",
  "Çınar Sigorta",
];

const money = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const prob = (p: number) => Math.max(0.05, Math.min(0.95, p));
const decline = (label = "Reddet"): Choice => ({ id: "decline", label, cost: 0, minutes: 0, p: 1, win: 0, lose: 0, winText: "", loseText: "", decline: true });

const TEMPLATES: Template[] = [
  {
    id: "maintenance",
    weight: 3,
    build: ({ H, bonus, client }) => ({
      sender: `${client}, Satın Alma Müdürlüğü`,
      subject: "Yıllık bakım sözleşmesi teklifi",
      body: `${client}, ofislerindeki kırk bilgisayarın yıllık bakımı için sizinle çalışmak istiyor. Sözleşme bugün imzalanırsa ilk dönemin ödemesini peşin yapacaklar.`,
      choices: [
        { id: "accept", label: "Sözleşmeyi imzala", cost: 0, minutes: 15, p: prob(0.85 + bonus), win: money(1.5 * H), lose: 0, winText: "Bakım ekibi ilk turu tamamladı, ödeme hesaba geçti.", loseText: "Ekip zamanında yetişemedi; müşteri sözleşmeyi iptal etti." },
        { id: "negotiate", label: "Daha yüksek ücret iste", cost: 0, minutes: 15, p: prob(0.5 + bonus), win: money(2.5 * H), lose: 0, winText: "Pazarlık tuttu, sözleşme yüksek bedelle imzalandı.", loseText: "Müşteri teklifi pahalı buldu ve rakibe gitti." },
        decline(),
      ],
    }),
  },
  {
    id: "tender",
    weight: 2,
    build: ({ H, bonus }) => ({
      sender: "Belediye Bilgi İşlem Müdürlüğü",
      subject: "Okul laboratuvarları ihalesine davet",
      body: "On iki okulun bilgisayar laboratuvarı yenilenecek. İhaleye katılmak için geçici teminat yatırmanız gerekiyor. İhale kaybedilirse teminatın yarısı iade edilir.",
      choices: [
        { id: "join", label: `Teminat yatır ve katıl (${formatMoney(money(H))})`, cost: money(H), minutes: 40, p: prob(0.45 + bonus * 1.5), win: money(4 * H), lose: money(0.5 * H), winText: "İhaleyi kazandın. Teminat iade edildi ve hakediş ödendi.", loseText: "İhale rakibe gitti; teminatın yarısı iade edildi." },
        decline("Katılma"),
      ],
    }),
  },
  {
    id: "rescue",
    weight: 3,
    build: ({ H, bonus, client }) => ({
      sender: `${client}, BT Departmanı`,
      subject: "Acil: sunucularımız çöktü",
      body: "E-ticaret sitemiz iki saattir kapalı ve bu akşam büyük bir kampanyamız var. Birini hemen gönderebilir misiniz? Ücret konusunda esneğiz.",
      choices: [
        { id: "team", label: "Hemen ekip gönder", cost: 0, minutes: 10, p: prob(0.7 + bonus), win: money(1.2 * H), lose: -money(0.3 * H), winText: "Ekip sistemi ayağa kaldırdı, müşteri primle ödedi.", loseText: "Sorun çözülemedi; ekip masrafları sana kaldı." },
        { id: "remote", label: "Uzaktan destek ver", cost: 0, minutes: 5, p: prob(0.5 + bonus), win: money(0.6 * H), lose: 0, winText: "Uzaktan bağlanıp sorunu çözdün.", loseText: "Uzaktan çözülemedi; müşteri başka firmayı çağırdı." },
        decline("Müsait değiliz"),
      ],
    }),
  },
  {
    id: "lot",
    weight: 2,
    build: ({ H, bonus }) => ({
      sender: "Ticaret Mahkemesi, İflas Masası",
      subject: "İflas eden distribütörün stoğu satışta",
      body: "İflas eden bir donanım distribütörünün deposundaki iki yüz parça ürün satışa çıkarılıyor. Ürünlerin durumu tam bilinmiyor; risk alıcıya aittir.",
      choices: [
        { id: "all", label: `Tüm partiyi al (${formatMoney(money(2 * H))})`, cost: money(2 * H), minutes: 30, p: prob(0.62 + bonus), win: money(3.6 * H), lose: money(1 * H), winText: "Ürünlerin çoğu sağlam çıktı ve hızla satıldı.", loseText: "Malların çoğu arızalı çıktı; ancak bir kısmını satabildin." },
        { id: "best", label: `Sadece seçme ürünleri al (${formatMoney(money(0.8 * H))})`, cost: money(0.8 * H), minutes: 30, p: prob(0.8 + bonus), win: money(1.4 * H), lose: money(0.4 * H), winText: "Seçtiğin ürünler kârla satıldı.", loseText: "Seçtiğin ürünlerin bir kısmı kusurluydu." },
        decline("İlgilenmiyoruz"),
      ],
    }),
  },
  {
    id: "investor",
    weight: 1,
    build: ({ H, bonus }) => ({
      sender: "Deniz Kaya, Melek Yatırımcı",
      subject: "Şirketinize yatırım yapmak istiyorum",
      body: "Büyüme hikâyenizi bir süredir takip ediyorum. Küçük bir azınlık payı karşılığında nakit desteği vermek istiyorum. Uygunsa bu hafta imzalayabiliriz.",
      choices: [
        { id: "accept", label: "Teklifi kabul et", cost: 0, minutes: 0, p: 1, win: money(2 * H), lose: 0, winText: "Yatırım tamamlandı, nakit hesaba geçti.", loseText: "" },
        { id: "raise", label: "Daha yüksek değerleme iste", cost: 0, minutes: 0, p: prob(0.5 + bonus), win: money(3.5 * H), lose: 0, winText: "Yatırımcı ikna oldu, daha yüksek değerlemeyle imzalandı.", loseText: "Yatırımcı teşekkür edip masadan kalktı." },
        decline(),
      ],
    }),
  },
  {
    id: "ransomware",
    weight: 1,
    crisis: true,
    build: ({ H, bonus }) => ({
      sender: "Güvenlik Operasyon Merkezi",
      subject: "Kritik: fidye yazılımı tespit edildi",
      body: "Muhasebe sunucusunda fidye yazılımı tespit edildi. Saldırganlar verilerin açılması için ödeme istiyor. Ne kadar beklersen hasar o kadar büyür; bu e-postayı yanıtsız bırakırsan zarar kesinleşir.",
      choices: [
        { id: "pay", label: `Fidyeyi öde (${formatMoney(money(H))})`, cost: 0, minutes: 0, p: 1, win: -money(H), lose: 0, winText: "Veriler geri geldi ama kasa hafifledi.", loseText: "" },
        { id: "fight", label: "Ekibinle müdahale et", cost: 0, minutes: 15, p: prob(0.6 + bonus), win: 0, lose: -money(1.5 * H), winText: "Ekip saldırıyı püskürttü, veri kaybı yok.", loseText: "Müdahale başarısız oldu; sistemleri sıfırdan kurmak pahalıya patladı." },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0.25, win: 0, lose: -money(0.8 * H), winText: "Şans yüzüne güldü; saldırı kendiliğinden durdu.", loseText: "Sistemler günlerce kapalı kaldı, müşteri kaybettin." },
      ],
    }),
  },
  {
    id: "consortium",
    weight: 2,
    needsPartner: true,
    build: ({ H, bonus, partner }) => ({
      sender: "Ilgaz Katılım Bankası, Satın Alma",
      subject: "Konsorsiyum davetiyesi",
      body: `Şube ağımızdaki donanım yenilemesi için ${partner} ile birlikte bir konsorsiyum kurmanızı öneriyoruz. İşin sizin payınıza düşen kısmı aşağıdadır.`,
      choices: [
        { id: "accept", label: "Konsorsiyuma katıl", cost: 0, minutes: 30, p: prob(0.75 + bonus), win: money(2 * H), lose: 0, winText: `Kurulum ${partner} ile birlikte tamamlandı, payın ödendi.`, loseText: "Banka projeyi erteledi; konsorsiyum dağıldı." },
        decline("Katılmayalım"),
      ],
    }),
  },
  {
    id: "press",
    weight: 2,
    build: ({ H, bonus }) => ({
      sender: "Günlük Piyasa Gazetesi, Teknoloji Masası",
      subject: "Röportaj talebi",
      body: "Hızla büyüyen yerel teknoloji şirketleri dosyamız için sizinle kısa bir görüşme yapmak istiyoruz. Haber yarın sabah yayınlanacak.",
      choices: [
        { id: "interview", label: "Röportajı ver", cost: 0, minutes: 0, p: prob(0.8 + bonus), win: money(0.8 * H), lose: 0, winText: "Haber yayınlandı; okuyan yeni müşteriler aradı.", loseText: "Röportaj sayfaya sığmadı, yayınlanmadı." },
        decline("Şimdi değil"),
      ],
    }),
  },
  {
    id: "talent",
    weight: 2,
    build: ({ H, bonus }) => ({
      sender: "İnsan Kaynakları",
      subject: "Rakipten kıdemli mühendis başvurusu",
      body: "Rakip bir şirketin kıdemli donanım mühendisi bize geçmek istiyor. İşe giriş primi talep ediyor ama getireceği müşteri portföyü ciddi.",
      choices: [
        { id: "hire", label: `İşe al (${formatMoney(money(H))} prim)`, cost: money(H), minutes: 40, p: prob(0.7 + bonus), win: money(3 * H), lose: money(0.2 * H), winText: "Mühendisin getirdiği müşteriler ilk siparişlerini verdi.", loseText: "Beklenen müşteriler gelmedi; mühendis kısa sürede ayrıldı." },
        decline("Kadromuz yeterli"),
      ],
    }),
  },

  // ---- Şirkete özel krizler (Parti B) ----
  {
    id: "strike",
    weight: 0.5,
    crisis: true,
    when: (s) => s.staff >= 2 || s.facilityLevel >= 3,
    build: ({ H, bonus }) => ({
      sender: "Çalışan Temsilcisi",
      subject: "Grev uyarısı",
      body: "Montaj ve depo çalışanları %20 zam istiyor. Talep karşılanmazsa yarın sabah iş bırakacaklarını söylüyorlar. Yanıtsız kalırsa grev başlar.",
      choices: [
        { id: "raise", label: `Zammı kabul et (${formatMoney(money(1.2 * H))})`, cost: money(1.2 * H), minutes: 0, p: 1, win: 0, lose: 0, winText: "Zam imzalandı, ekip işinin başında.", loseText: "", rep: { win: 1 } },
        { id: "negotiate", label: "Pazarlık masasına otur", cost: 0, minutes: 20, p: prob(0.55 + bonus), win: -money(0.4 * H), lose: 0, winText: "Yarı yolda buluşuldu; küçük bir zamla anlaşıldı.", loseText: "Görüşmeler çıkmaza girdi, ekip iş bıraktı.", rep: { lose: -2 }, fx: { lose: { kind: "halt", value: 1, hours: 6, label: "Grev: üretim 6 saat durdu" } }, post: { lose: "strike" }, risk: 0.45 * (0.6 * H + 6 * 0.1 * H) },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0.2, win: 0, lose: 0, winText: "Ekip son anda geri adım attı.", loseText: "Grev başladı, bantlar durdu.", rep: { lose: -3 }, fx: { lose: { kind: "halt", value: 1, hours: 10, label: "Grev: üretim 10 saat durdu" } }, post: { lose: "strike" }, risk: 0.8 * (0.9 * H + 10 * 0.1 * H) },
      ],
    }),
  },
  {
    id: "recall",
    weight: 0.5,
    crisis: true,
    when: (s) => s.soldMax >= 30,
    build: ({ H, bonus, model }) => ({
      sender: "Kalite Kontrol Birimi",
      subject: `“${model}” modelinde arıza bildirimi`,
      body: `Son partide satılan “${model}” cihazlarında güç kaynağı aşırı ısınıyor. Henüz yaralanan yok ama forumlarda şikâyetler artıyor. Yanıtsız kalırsa konu basına düşer.`,
      choices: [
        { id: "recall", label: `Gönüllü geri çağırma başlat (${formatMoney(money(1.5 * H))})`, cost: money(1.5 * H), minutes: 0, p: 1, win: 0, lose: 0, winText: "Geri çağırma takdir topladı; müşteriler şeffaflığı övdü.", loseText: "", rep: { win: 2 }, post: { win: "recall_good" } },
        { id: "quiet", label: "Sessiz kal, tek tek değiştir", cost: 0, minutes: 30, p: prob(0.45 + bonus), win: -money(0.3 * H), lose: 0, winText: "Şikâyetler sessizce çözüldü.", loseText: "Haber yayıldı; müşteriler markadan uzaklaştı.", rep: { lose: -6 }, fx: { lose: { kind: "demand", value: -0.4, hours: 12, label: "Arıza skandalı: PC talebi 12 saat %40 düştü" } }, post: { lose: "recall_bad" }, risk: 0.55 * (1.8 * H + 12 * 0.4 * 0.3 * H) },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0.35, win: 0, lose: 0, winText: "Şikâyetler kendiliğinden azaldı.", loseText: "Konu basına düştü; satışlar çakıldı.", rep: { lose: -6 }, fx: { lose: { kind: "demand", value: -0.4, hours: 12, label: "Arıza skandalı: PC talebi 12 saat %40 düştü" } }, post: { lose: "recall_bad" }, risk: 0.65 * (1.8 * H + 12 * 0.4 * 0.3 * H) },
      ],
    }),
  },
  {
    id: "supply",
    weight: 0.5,
    crisis: true,
    when: (s) => s.models >= 1,
    build: ({ H, bonus }) => ({
      sender: "Satın Alma Departmanı",
      subject: "Ana tedarikçimiz teslimatı durdurdu",
      body: "Parça tedarikçimizin limanda bekleyen konteynerleri gümrükte kaldı. Bu hafta yeni parça gelmeyecek. Karar vermezsen en pahalı yoldan alım yapılır.",
      choices: [
        { id: "pricey", label: "Pahalı tedarikçiden al", cost: 0, minutes: 0, p: 1, win: 0, lose: 0, winText: "Üretim sürüyor ama parçalar pahalıya geliyor.", loseText: "", fx: { win: { kind: "parts", value: 0.25, hours: 8, label: "Tedarik krizi: parça maliyeti 8 saat %25 arttı" } }, risk: 0.3 * H },
        { id: "pause", label: "Üretimi durdur, stokla idare et", cost: 0, minutes: 0, p: 1, win: 0, lose: 0, winText: "Bantlar durdu; depodaki stok satılmaya devam ediyor.", loseText: "", fx: { win: { kind: "halt", value: 1, hours: 6, label: "Tedarik krizi: üretim 6 saat durdu" } }, risk: 0.4 * H },
        { id: "grey", label: "Gri piyasadan parça bul", cost: 0, minutes: 20, p: prob(0.6 + bonus), win: 0, lose: -money(0.8 * H), winText: "Parçalar sorunsuz geldi, kimse fark etmedi.", loseText: "Faturasız parçalar denetimde yakalandı, ceza kesildi.", rep: { lose: -4 }, post: { lose: "grey_market" }, risk: 0.4 * 1.2 * H },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 1, win: 0, lose: 0, winText: "Satın alma en pahalı yoldan parça buldu.", loseText: "", fx: { win: { kind: "parts", value: 0.4, hours: 10, label: "Tedarik krizi: parça maliyeti 10 saat %40 arttı" } }, risk: 0.6 * H },
      ],
    }),
  },
  {
    id: "audit",
    weight: 0.5,
    crisis: true,
    when: (s) => s.netWorth >= 200_000,
    build: ({ H, accountant }) => ({
      sender: "Vergi Dairesi Müdürlüğü",
      subject: "Vergi incelemesi bildirimi",
      body: `Şirketinizin son dönem kayıtları incelemeye alınmıştır. Defter ve belgelerinizi hazır bulundurmanız rica olunur.${accountant ? " Muhasebecin kayıtların düzenli olduğunu söylüyor." : " Kayıtlar biraz karışık; muhasebecin olmadığı belli oluyor."}`,
      choices: [
        { id: "open", label: "Defterleri aç", cost: 0, minutes: 30, p: accountant ? 0.92 : 0.55, win: 0, lose: -money(2.5 * H), winText: "İnceleme temiz çıktı.", loseText: "Eksik belgeler nedeniyle vergi cezası kesildi.", rep: { lose: -3 }, post: { lose: "tax_fine" } },
        { id: "advisor", label: `Mali müşavir tut (${formatMoney(money(0.8 * H))})`, cost: money(0.8 * H), minutes: 30, p: 0.9, win: 0, lose: -money(1.5 * H), winText: "Müşavir dosyayı toparladı, inceleme sorunsuz kapandı.", loseText: "Müşavire rağmen bir eksik bulundu, ceza kesildi.", rep: { lose: -2 }, post: { lose: "tax_fine" } },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0, win: 0, lose: -money(4 * H), winText: "", loseText: "Bildirime yanıt verilmediği için en ağır ceza kesildi.", rep: { lose: -5 }, post: { lose: "tax_fine" } },
      ],
    }),
  },
  {
    id: "fire",
    weight: 0.4,
    crisis: true,
    when: (s) => s.facilityLevel >= 2,
    build: ({ H }) => ({
      sender: "Tesis Müdürü",
      subject: "Depoda yangın çıktı",
      body: "Gece depodaki şarj istasyonunda kısa devre yangına yol açtı. İtfaiye müdahale etti, yaralanan yok ama montaj alanı kullanılamıyor.",
      choices: [
        { id: "repair", label: `Hemen onart (${formatMoney(money(1.5 * H))})`, cost: money(1.5 * H), minutes: 0, p: 1, win: 0, lose: 0, winText: "Onarım ekibi sabaha kadar çalıştı.", loseText: "", fx: { win: { kind: "halt", value: 1, hours: 2, label: "Yangın onarımı: üretim 2 saat durdu" } }, risk: 0.2 * H },
        { id: "insurance", label: "Sigortaya bildir, ekspertizi bekle", cost: 0, minutes: 30, p: 0.65, win: money(0.3 * H), lose: -money(1 * H), winText: "Sigorta hasarı karşıladı, üstüne kira kaybı da ödendi.", loseText: "Sigorta kapsam dışı dedi; onarım sana kaldı.", fx: { win: { kind: "halt", value: 1, hours: 6, label: "Ekspertiz: üretim 6 saat durdu" }, lose: { kind: "halt", value: 1, hours: 8, label: "Ekspertiz ve onarım: üretim 8 saat durdu" } }, risk: 0.7 * H },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0, win: 0, lose: -money(1 * H), winText: "", loseText: "Kimse ilgilenmeyince hasar büyüdü.", fx: { lose: { kind: "halt", value: 1, hours: 24, label: "Yangın hasarı: üretim 24 saat durdu" } }, risk: 2.4 * H },
      ],
    }),
  },
  {
    id: "leak",
    weight: 0.4,
    crisis: true,
    when: (s) => s.netWorth >= 50_000,
    build: ({ H, bonus }) => ({
      sender: "Bilgi Güvenliği Sorumlusu",
      subject: "Müşteri verileri sızdırıldı",
      body: "Servis kayıt sistemimizden müşteri adları ve telefonları bir forumda paylaşılmış. Henüz kimse fark etmedi ama er geç ortaya çıkacak.",
      choices: [
        { id: "disclose", label: `Kamuoyuna açıkla, müşterileri bilgilendir (${formatMoney(money(0.5 * H))})`, cost: money(0.5 * H), minutes: 0, p: 1, win: 0, lose: 0, winText: "Açıklama sert eleştiri aldı ama dürüstlük takdir edildi.", loseText: "", rep: { win: -1 }, post: { win: "leak_open" } },
        { id: "cover", label: "Örtbas et", cost: 0, minutes: 30, p: prob(0.55 + bonus), win: 0, lose: 0, winText: "Paylaşım kaldırıldı, konu kapandı.", loseText: "Örtbas girişimi ortaya çıktı; tepki çığ gibi büyüdü.", rep: { lose: -8 }, fx: { lose: { kind: "demand", value: -0.25, hours: 12, label: "Veri skandalı: PC talebi 12 saat %25 düştü" } }, post: { lose: "leak_cover" }, risk: 0.45 * (2.4 * H + 12 * 0.25 * 0.3 * H) },
        { id: "ignore", label: "Görmezden gel", cost: 0, minutes: 0, p: 0.3, win: 0, lose: 0, winText: "Paylaşım gözden kaçtı.", loseText: "Sızıntı haber oldu.", rep: { lose: -6 }, post: { lose: "leak_cover" }, risk: 0.7 * 1.8 * H },
      ],
    }),
  },
];

const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Şirket başarısına bağlı başarı bonusu: en yüksek donanım kademesi ve kariyer basamağı. */
export function successBonus(owned: Owned, netWorth: number): number {
  const maxTier = EQUIPMENT.reduce((m, e) => ((owned[e.id] ?? 0) > 0 ? Math.max(m, e.tier) : m), 0);
  const level = stageFor(netWorth).stage.level;
  return Math.min(0.15, 0.015 * maxTier + 0.01 * (level - 1));
}

/** Teklif ölçeği: bir saatlik gelir (başlangıçta en az $200). */
export function offerUnit(owned: Owned): number {
  return Math.max(200, incomePerHour(owned));
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of items) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export type OfferRow = {
  id: string;
  company_id: string;
  template: string;
  sender: string;
  subject: string;
  body: string;
  choices: Choice[];
  status: "open" | "active" | "done" | "expired" | "declined";
  choice_id: string | null;
  resolves_at: string | null;
  result_text: string | null;
  result_amount: number | null;
  expires_at: string;
  created_at: string;
  read_at: string | null;
};

/** Para dışı sonuçlar: itibar, süreli etki, haber. */
async function applyExtras(companyId: string, companyName: string, c: Choice, success: boolean, press: number) {
  const rep = success ? c.rep?.win : c.rep?.lose;
  const fx = success ? c.fx?.win : c.fx?.lose;
  const post = success ? c.post?.win : c.post?.lose;
  if (fx) {
    await addEffect(companyId, fx.kind, fx.value, fx.hours, fx.label);
    await logEvent(companyId, "crisis", fx.label + ".");
  }
  if (rep) await db().rpc("adjust_reputation", { p_company: companyId, p_delta: rep });
  if (post) await postAbout(companyId, post, { company: companyName }, press);
  if (fx?.kind === "demand") {
    const { invalidateMarket } = await import("./workshop");
    invalidateMarket();
  }
}

/** Başarıyla örtbas edilen krizler: "şablon:seçenek" → sır türü. */
const COVER_UPS: Record<string, SecretKind> = {
  "leak:cover": "leak_cover",
  "leak:ignore": "leak_hidden",
  "recall:quiet": "recall_quiet",
  "recall:ignore": "recall_quiet",
  "supply:grey": "grey_parts",
  "ransomware:pay": "ransom_paid",
};

/** Seçeneği sonuçlandırır (zar atar) ve nakdi atomik olarak değiştirir. */
async function settle(o: OfferRow, choice: Choice, status: "done" | "expired", companyName: string, press = 0): Promise<boolean> {
  const success = Math.random() < choice.p;
  const amount = success ? choice.win : choice.lose;
  const text = success ? choice.winText : choice.loseText;
  const { data: ok, error } = await db().rpc("settle_offer", { p_offer: o.id, p_status: status, p_amount: amount, p_text: text });
  if (error) throw new HttpError(500, error.message);
  if (ok) {
    // \u2060: tutar satır sonunda bölünmesin
    const sign = amount > 0 ? `+\u2060${formatMoney(amount)}` : amount < 0 ? `−\u2060${formatMoney(-amount)}` : "";
    await logEvent(o.company_id, "offer", `${o.subject}: ${text}${sign ? ` (${sign})` : ""}`, amount);
    if (o.template === "ransomware" && amount < 0) await postAbout(o.company_id, "ransomware", { company: companyName }, press);
    await applyExtras(o.company_id, companyName, choice, success, press);
    if (o.template === "tender" && success) await postAbout(o.company_id, "tender_won", { company: companyName }, press);
    // Örtbas edilen kriz sır bırakır (015): ileride biri dosyasını bulup şantaj yapabilir
    const hidden = success ? COVER_UPS[`${o.template}:${choice.id}`] : undefined;
    if (hidden) await recordSecret(o.company_id, hidden, { company: companyName });
  }
  return !!ok;
}

/**
 * Teklifleri güncel hale getirir: süresi gelen işleri sonuçlandırır, süresi dolanları kapatır,
 * aralık geldiyse yeni teklif üretir. Göç yapılmadıysa sessizce boş döner.
 */
export async function syncOffers(
  company: { id: string; name: string },
  owned: Owned,
  netWorth: number,
  perks: Record<Perk, number>
): Promise<{ changed: boolean; ready: boolean }> {
  const now = Date.now();
  const { data: live, error } = await db()
    .from("company_offers")
    .select("*")
    .eq("company_id", company.id)
    .in("status", ["open", "active"]);
  if (error) {
    if (isMissingTable(error)) return { changed: false, ready: false };
    throw new HttpError(500, error.message);
  }

  let changed = false;
  let open = 0;
  const secretary = ((company as any)._staff ?? []).includes("sekreter");
  for (const o of (live ?? []) as OfferRow[]) {
    if (o.status === "active" && o.resolves_at && new Date(o.resolves_at).getTime() <= now) {
      const choice = o.choices.find((c) => c.id === o.choice_id);
      if (choice && (await settle(o, choice, "done", company.name, perks.press))) changed = true;
    } else if (o.status === "open" && new Date(o.expires_at).getTime() <= now) {
      const tpl = TEMPLATE_BY_ID[o.template];
      const ignore = tpl?.crisis ? o.choices.find((c) => c.id === "ignore") : undefined;
      if (ignore) {
        if (await settle(o, ignore, "expired", company.name, perks.press)) changed = true;
      } else {
        await db().rpc("settle_offer", { p_offer: o.id, p_status: "expired", p_amount: 0, p_text: "Yanıt verilmediği için teklifin süresi doldu." });
      }
    } else if (o.status === "open" && secretary && new Date(o.expires_at).getTime() - now < SECRETARY_LEAD_MIN * 60_000) {
      // Sekreter: süresi dolmak üzere olan teklifi senin yerine yanıtlar
      const pick = secretaryChoice(o, Number((company as any).cash ?? 0), !!TEMPLATE_BY_ID[o.template]?.crisis);
      try {
        await respondOffer(company.id, company.name, o.id, pick.id, perks.press);
      } catch {
        await respondOffer(company.id, company.name, o.id, "decline", perks.press).catch(() => {});
      }
      await logEvent(company.id, "offer", `Sekreter, “${o.subject}” teklifini senin yerine yanıtladı: ${pick.label}.`);
      changed = true;
    } else if (o.status === "open") {
      open++;
    }
  }

  // Yeni teklif üretimi
  const { data: last } = await db().from("company_offers").select("created_at").eq("company_id", company.id).order("created_at", { ascending: false }).limit(1);
  const lastAt = last?.[0] ? new Date(last[0].created_at).getTime() : 0;
  const slots = lastAt === 0 ? 1 : Math.floor((now - lastAt) / (OFFER_EVERY_MIN * 60_000));
  const toCreate = Math.max(0, Math.min(MAX_OPEN - open, slots));

  if (toCreate > 0) {
    // Konsorsiyum senaryosu için gerçek bir rakip şirket adı
    const { data: others } = await db().from("companies").select("name").neq("id", company.id).limit(50);
    const names = (others ?? []).map((r) => r.name as string);
    // Krizlerin koşulları için şirketin durumu
    const { data: ms } = await db().from("pc_models").select("name, sold_total").eq("company_id", company.id);
    const top = (ms ?? []).slice().sort((a, b) => b.sold_total - a.sold_total)[0];
    const c = company as any;
    const staff: string[] = c._staff ?? [];
    const sit: Situation = {
      staff: staff.length,
      accountant: staff.includes("muhasebeci"),
      facilityLevel: effectiveLevel(c.facility_level, c.facility_target, c.facility_ready_at),
      models: (ms ?? []).length,
      soldMax: top?.sold_total ?? 0,
      netWorth,
    };
    const H = offerUnit(owned);
    const bonus = Math.min(0.25, successBonus(owned, netWorth) + perks.offer);
    const rows = [];
    const ev = currentEvent().effects;
    for (let i = 0; i < toCreate; i++) {
      // Dünya olayı: siber saldırı dalgasında krizler daha sık
      const pool = TEMPLATES.filter((t) => (!t.needsPartner || names.length > 0) && (!t.when || t.when(sit))).map((t) => ({ ...t, weight: t.crisis ? t.weight * (ev.crisisWeight ?? 1) : t.weight }));
      const tpl = pickWeighted(pool);
      const client = CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
      const partner = names.length ? names[Math.floor(Math.random() * names.length)] : null;
      const built = tpl.build({ H, bonus, client, partner, model: top?.name ?? null, accountant: sit.accountant });
      // Dünya olayı: teklif ödülleri çarpanı (yalnızca kazançlar)
      if (ev.offerReward && ev.offerReward !== 1) {
        built.choices = built.choices.map((c) => ({ ...c, win: c.win > 0 ? money(c.win * ev.offerReward!) : c.win }));
      }
      // Kriz kalkanı (avukat, iletişim danışmanı): olumsuz tutarlar küçülür
      if (perks.shield > 0) {
        built.choices = built.choices.map((c) => ({
          ...c,
          win: c.win < 0 ? -money(-c.win * (1 - perks.shield)) : c.win,
          lose: c.lose < 0 ? -money(-c.lose * (1 - perks.shield)) : c.lose,
        }));
      }
      rows.push({
        company_id: company.id,
        template: tpl.id,
        ...built,
        // Birden çok teklif aynı anda üretilirse sıralama düzgün olsun
        created_at: new Date(now - (toCreate - 1 - i) * 1000).toISOString(),
        expires_at: new Date(now + EXPIRE_MIN * 60_000).toISOString(),
      });
    }
    const { error: insErr } = await db().from("company_offers").insert(rows);
    if (insErr) throw new HttpError(500, insErr.message);
  }

  return { changed, ready: true };
}

const SECRETARY_LEAD_MIN = 10;

/** Sekreterin seçimi: beklenen değeri en yüksek seçenek; zararlıysa reddet (krizde en az zararlısı). */
export function secretaryChoice(o: OfferRow, cash: number, crisis: boolean): Choice {
  const options = o.choices.filter((c) => !c.decline && c.cost <= cash);
  const ev = (c: Choice) => c.p * c.win + (1 - c.p) * c.lose - c.cost - (c.risk ?? 0);
  const best = options.sort((a, b) => ev(b) - ev(a))[0];
  const decline = o.choices.find((c) => c.decline);
  if (!best) return decline ?? o.choices[0];
  if (!crisis && ev(best) <= 0 && decline) return decline;
  return best;
}

/** Oyuncunun seçimini uygular. Anında sonuçlanan seçenekler hemen kapanır. */
export async function respondOffer(companyId: string, companyName: string, offerId: string, choiceId: string, press = 0): Promise<{ offer: OfferRow }> {
  const { data: o, error } = await db().from("company_offers").select("*").eq("id", offerId).eq("company_id", companyId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!o) throw new HttpError(404, "Teklif bulunamadı");
  const offer = o as OfferRow;
  if (offer.status !== "open") throw new HttpError(409, "Bu teklif artık yanıtlanamaz");
  if (new Date(offer.expires_at).getTime() <= Date.now()) throw new HttpError(409, "Teklifin süresi doldu");
  const choice = offer.choices.find((c) => c.id === choiceId);
  if (!choice) throw new HttpError(400, "Seçenek geçersiz");

  if (choice.decline) {
    await db().rpc("settle_offer", { p_offer: offer.id, p_status: "declined", p_amount: 0, p_text: "Teklifi reddettin." });
  } else {
    const resolvesAt = new Date(Date.now() + choice.minutes * 60_000).toISOString();
    const { data: ok, error: accErr } = await db().rpc("accept_offer", {
      p_offer: offer.id,
      p_company: companyId,
      p_choice: choice.id,
      p_cost: choice.cost,
      p_resolves_at: resolvesAt,
    });
    if (accErr) {
      if (/Yetersiz nakit/i.test(accErr.message)) throw new HttpError(400, `Bu seçenek için kasada ${formatMoney(choice.cost)} olmalı`);
      throw new HttpError(500, accErr.message);
    }
    if (!ok) throw new HttpError(409, "Bu teklif artık yanıtlanamaz");
    if (choice.cost > 0) await logEvent(companyId, "offer", `${offer.subject}: ${formatMoney(choice.cost)} ödendi, sonuç bekleniyor.`, -choice.cost);
    if (choice.minutes === 0) await settle({ ...offer, status: "active", choice_id: choice.id }, choice, "done", companyName, press);
  }

  const { data: fresh } = await db().from("company_offers").select("*").eq("id", offer.id).single();
  return { offer: fresh as OfferRow };
}

/** İstemciye gönderilecek teklif görünümü. */
export function offerView(o: OfferRow) {
  const chosen = o.choice_id ? o.choices.find((c) => c.id === o.choice_id) : null;
  return {
    id: o.id,
    template: o.template,
    sender: o.sender,
    subject: o.subject,
    body: o.body,
    status: o.status,
    choices: o.choices.map((c) => ({
      id: c.id,
      label: c.label,
      cost: c.cost,
      minutes: c.minutes,
      p: c.p,
      win: c.win,
      lose: c.lose,
      decline: !!c.decline,
      winNote: note(c.rep?.win, c.fx?.win),
      loseNote: note(c.rep?.lose, c.fx?.lose),
    })),
    chosen: chosen ? { id: chosen.id, label: chosen.label } : null,
    resolvesAt: o.resolves_at,
    resultText: o.result_text,
    resultAmount: o.result_amount === null ? null : Number(o.result_amount),
    expiresAt: o.expires_at,
    createdAt: o.created_at,
    read: !!o.read_at,
    crisis: !!TEMPLATE_BY_ID[o.template]?.crisis,
  };
}
