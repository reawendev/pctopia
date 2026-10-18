# PCTopia

Çok oyunculu bilgisayar şirketi tycoon oyunu. Şimdilik yalnızca web; mobil (Capacitor) ilk sürüm oturduktan sonra eklenecek.

**Stack:** Next.js 14 (App Router) · Supabase (auth + Postgres) · Tailwind

## Kurulum

1. Supabase'de yeni proje aç. **SQL Editor**'de sırayla çalıştır:
   - `supabase/schema.sql`
   - `supabase/migrations/002_borsa.sql`
   - `supabase/migrations/003_gorseller_gunluk.sql`
   - `supabase/migrations/004_teklifler_posta.sql`
   - `supabase/migrations/005_atolye_sosyal_hayat.sql`
   - `supabase/migrations/006_sezonlar.sql`
   - `supabase/migrations/007_finans.sql`
   - `supabase/migrations/008_sosyal_profil.sql`
   - `supabase/migrations/009_ihale_arge.sql`
   - `supabase/migrations/010_tesis_kriz.sql`
   - `supabase/migrations/011_halka_arz_operasyon.sql`
   - `supabase/migrations/012_kulup_bahis.sql`
   - `supabase/migrations/013_banka_kilit.sql`

   Mevcut bir veritabanını güncelliyorsan yalnızca henüz çalıştırmadığın `migrations/` dosyalarını çalıştır.
2. `.env.example` dosyasını `.env.local` olarak kopyala, Supabase anahtarlarını gir.
3. ```bash
   npm install
   npm run dev
   ```
4. Kayıt ol, sonra kendini yönetici yap (SQL Editor):
   ```sql
   update public.profiles set is_admin = true
     where id = (select id from auth.users where email = 'senin@epostan.com');
   ```
   Oyun ekranının altında "Yönetici paneli" bağlantısı çıkar (`/admin`).

> Hızlı test için Supabase > Authentication > Providers > Email altında "Confirm email" seçeneğini kapatabilirsin.

## Yayın (Vercel)

Vercel'e bağla, ortam değişkenlerini ekle: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ve isteğe bağlı `PIXELLAB_API_KEY`.

## Görseller (PixelLab)

- Kuruluş ekranında oyuncu seçimlerini yapıp "Portreyi çizdir" / "Armayı çizdir" der; sunucu (`/api/generate`) seçimleri İngilizce bir tarife çevirip (`src/lib/game/prompts.ts`) PixelLab `generate-image-pixflux` uç noktasına gönderir.
- PNG, Supabase Storage'daki herkese açık `generated` deposuna yazılır; adresi `companies.portrait_url` / `logo_url` sütunlarına kaydedilir.
- Kişi başı, tür başı 24 saatte 5 üretim hakkı vardır (yöneticiler sınırsız). Her üretim maliyetiyle `asset_generations` tablosuna yazılır; yönetici panelinde bakiye ve son 24 saatin harcaması görünür.
- Anahtar yoksa ya da üretim başarısız olursa oyun sade SVG portre ve armayla devam eder.

## Ekonomi

- Başlangıç sermayesi $3.000. Gelir hızı kademeye göre: ilk iki makine x10, üçüncü ve dördüncü x6, sunucu rafı ve üstü x4 (`src/lib/game/config.ts`). Erken kademeler 1 saatte, geç kademeler 3,5 saatte kendini öder.

## Teklifler ve senaryolar

- `src/lib/server/offers.ts` — 9 senaryo şablonu (bakım sözleşmesi, kamu ihalesi, acil müdahale, iflas stoğu, melek yatırımcı, fidye yazılımı krizi, banka konsorsiyumu, röportaj, yetenek transferi).
- Her 20 dakikada bir yeni teklif, aynı anda en fazla 3 açık teklif; yanıtlanmayan teklif 2 saatte düşer. Kriz yanıtsız kalırsa "görmezden gel" sonucu uygulanır.
- Ödüller şirketin saatlik gelirine göre ölçeklenir (en az $200). Başarı şansı, en yüksek donanım kademesi ve kariyer basamağıyla artar (en fazla +%15).
- Teklifler sayfa açıkken 30 saniyede bir `/api/inbox` ile güncellenir; nakit değişiklikleri `accept_offer` / `settle_offer` SQL fonksiyonlarıyla atomik ve tek seferliktir.

## Posta

- Şirketler birbirine konu + metin (en fazla 2000 karakter) gönderebilir; saatte 20 posta sınırı vardır. Gelen kutusu teklifleri ve mesajları birlikte gösterir; okunmamış sayısı Posta sekmesinde rozet olarak görünür.

## PC Atölyesi

- `src/lib/game/workshop.ts` — 4 parça yuvası (işlemci, ekran kartı, bellek, depolama) × 3 kalite. Birim maliyet = parçalar + $60 montaj.
- Hak ettiği fiyat = parçaların piyasa değeri (maliyet × 1,35) + montaj; işlemci ile ekran kartı arasında iki kademe fark varsa %12 düşük; itibara göre ±%10.
- **Ortak pazar:** 4 segment (ofis, oyun, üst segment, iş istasyonu). Segment talebi D = 2 × taban × (1 + 0,5 × (satıcı şirket − 1)) × olay çarpanı. Her ilanın çekiciliği = fiyat çarpanı × itibar × (1 + talep yararı); pazarda ayrıca çekiciliği 1 olan kurgusal rakipler var. Satış hızı = D × çekicilik / (toplam çekicilik + 1). Ucuz ve itibarlı olan pay çalar; fiyat/değer 1,5'in üstünde çekicilik sıfırdır, 2'nin üstü etikete yazılamaz.
- Pazar listesi 15 sn önbelleklenir (`loadMarket`); fiyat/stok değişikliğinde önbellek temizlenir.
- Satışlar gelir gibi tembel hesaplanır (en fazla 12 saat birikir), `settle_sales` ile bir kez kasaya geçer.

## İhaleler

- `src/lib/server/tenders.ts`: her 2 saatte bir yeni ihale, teklifler 4 saat açık (aynı anda iki ihale). Şartname (alıcı, adet, en düşük parça kaliteleri, tavan birim fiyat) ve kurgusal rakibin kapalı zarfı gizli tohumdan üretilir, ilk ihtiyaçta `tenders` tablosuna yazılır.
- Teklif verirken toplam tutarın %5'i teminat olarak kasadan alınır. Puan = birim fiyat × (1,2 − itibar/250); en düşük puan kazanır. Kurgusal rakibin puanı itibar 60 ile hesaplanır.
- Kapanışta (`settle_tender`, tek işlem) kazananın deposundan teslimat yapılır: stok yoksa ya da model şartnameye uymuyorsa teminat yanar, itibar −6, sıra sonrakine geçer. Kazanan itibar +3 alır; diğer teminatlar iade edilir.

## Ar-Ge

- `src/lib/game/research.ts`: 6 proje (montaj hattı, tedarikçi anlaşmaları, sessiz soğutma, endüstriyel tasarım, yapay zekâ hızlandırıcı, yeni nesil grafik mimarisi). Etkiler: parça maliyeti indirimi, hak edilen fiyat (`fairValue` premium) ve pazarda çekicilik.
- Aynı anda tek proje, bedel peşin. Patentli iki projeyi ilk bitiren 24 saat tek başına kullanır; patent süresinde bitirenler patent bitince yararlanır. Hesap tamamen kayıtlardan yapılır, zamanlayıcı gerekmez.

## Tesis

- `src/lib/game/facility.ts`: garajdan teknoloji kampüsüne 6 seviye. Her seviye model sayısını, model başına depoyu ve tek seferde üretimi artırır; 3. seviyeden itibaren ölçek ekonomisi (üretim maliyeti −%3 … −%12). İnşaat 1–24 saat sürer, bedel peşin, her açılışta itibar +2 ve haber.
- Sınırlar veritabanında da uygulanır (`facility_max_stock`, `facility_max_models`; `produce_pc` ve toptan satış bunları kullanır). Yatırımın yarısı net değere sayılır.

## Kriz senaryoları

- Teklif havuzunda şirketin durumuna göre çıkan krizler (`src/lib/server/offers.ts`): grev (çalışanı ya da büyük tesisi olana), arızalı parti / geri çağırma (bir modelinden 30+ satan), tedarik krizi, vergi incelemesi (muhasebecisi olan daha rahat geçer), depo yangını, müşteri verisi sızıntısı. Yanıtsız kalan kriz kendi "görmezden gel" sonucuyla kapanır.
- Seçenekler para dışında itibar, sosyal medya haberi ve süreli etki doğurabilir. Süreli etkiler `company_effects` tablosunda tutulur: `halt` (üretim durur), `demand` (PC çekiciliği; −1 satışı durdurur), `parts` (parça maliyeti artar). Ofis'te "Süren krizler" kartında görünür.

## Halka arz

- `src/lib/game/equity.ts`, `src/lib/server/equity.ts`. Her şirket 1.000 kurucu hissesiyle başlar. Halka arzda (en az $100 bin şirket değeri, en az 50 hisse) yeni hisse basılır: kasaya fiyat × adet × 0,95 girer, kurucu payı oransal küçülür; kurucu %51'in altına inemez.
- Fiyat = oyuncu hisseleri hariç şirket değeri × piyasa algısı (itibar 0 → ×0,75, 100 → ×1,25) ÷ toplam hisse. Oyuncular piyasadaki serbest hisseyi %1 komisyonla alıp satar; şirket kendi hissesini geri alıp iptal edebilir.
- **Sıralama kurucunun payına göredir:** şirket değeri × kurucu hissesi ÷ toplam hisse. Elindeki diğer şirket hisseleri şirket değerine eklenir.

## Gizli operasyonlar

- `src/lib/game/ops.ts`, `src/lib/server/ops.ts`: karalama kampanyası, sahte yorum dalgası, endüstriyel casusluk (rakibin Ar-Ge'sini kopyala), ihale zarfını ele geçir (rakibin teklifini öğren), yönetici ayartma. Rakibin profil sayfasından yapılır.
- Bedel rakibin değerinin %0,4'ü (en az $3.000) × operasyon katsayısı. Başarı ve yakalanma ayrı zarlarla belirlenir. Yakalanan saldırgan itibar −8 kaybeder (PR uzmanı yarıya indirir), haber çıkar ve hedef kimin yaptığını öğrenir; yakalanmazsa hedef yalnızca olanı görür.
- Sınırlar: saldırgan 6 saatte en fazla 3 operasyon, aynı hedefe 6 saatte 1; son 6 saatte 2 başarılı saldırı alan şirket korunur.
- Testler için `OPS_TEST_ROLLS` ortam değişkeni zarları sabitler; canlıda tanımlama.

## Kulüp (Hayat → Kulüp)

Hepsi oyun parasıyla; gerçek parayla hiçbir bağlantısı yoktur ve olmamalıdır (oyun içi satın alma eklenirse bu bölüm kaldırılmalı). Kasa her oyunda biraz öndedir; bu, ekonomideki fazla parayı yavaşça emer.

- **Masa oyunları** (`src/lib/game/casino.ts`): Avrupa ruleti (kasa %2,7), iki zar (8+ / 6− ×2,35, tam 7 ×5,8), blackjack (krupiye 17'de durur, blackjack 3:2, ikiye katlama). Zarlar `crypto.randomInt` ile sunucuda atılır; blackjack destesi sunucuda saklanır, krupiyenin kapalı kartı el bitene kadar gönderilmez.
- **Piyasa bahsi:** bir hisse 15 dk / 1 saat sonra yukarıda mı aşağıda mı? Oran = 0,95 ÷ olasılık; olasılık fiyat modelinin o anki durumundan hesaplanır (`upProbability`), böylece çöküş sonrası "toparlanır" gibi bariz bahisler ucuzlamaz.
- **Bahis bürosu:** ortak havuzlu bahisler; her gün 21:00 (İstanbul) "sıralamada 1. kim?" (sonuçtan 12 saat önce kapanır) ve her açık ihale için "kim alacak?". Büro %5 alır, kalanı bilenler paylaşır; kimse bilemezse iade.
- Tek bahis en fazla şirket değerinin %10'u. 24 saatte değerinin %20'sinden (en az $20 bin) fazlasını kaybeden magazine düşer: itibar −3, partnerin yakınlığı −8 (günde bir kez).

## Dünya olayları

- `src/lib/game/events.ts` tanımlar, `src/lib/server/events.ts` takvim. Her 8 saatlik dilimin (İstanbul 00/08/16) olayı gizli tohumla seçilir; herkes aynı olayı görür, gelecek tahmin edilemez.
- Etkiler: segment talebi, parça maliyeti + piyasa değeri, teklif ödülleri, kriz sıklığı.
- Testte olayı sabitlemek için `EVENT_OVERRIDE=calm` (yayında tanımlama).

## Sezonlar

- Yönetici panelinden "SEZONU BİTİR" yazarak bitirilir (önerilen bitiş: pazartesi 00:00). İlk üç şirket şeref listesine yazılır, `end_season` tüm şirketleri ve oyun verisini tek işlemde siler, yeni sezonu açar. Hesaplar ve yönetici yetkileri kalır.

## Finans

- `src/lib/game/finance.ts` kuralları, `src/lib/server/finance.ts` tembel hesaplamayı yapar (şirket ve posta isteklerinde çalışır).
- **Çalışanlar:** muhasebeci (10 dakikada bir kendisi tahsilat yapar, birikme sınırı 24 saat), sekreter (süresi dolmak üzere olan teklifleri en iyi beklenen değerle yanıtlar), satış müdürü (PC talebi +%15), PR uzmanı (olumsuz itibar etkisini yarıya indirir). Maaş saatlik işler; kasa ödeyemezse çalışan istifa eder.
- **Banka:** günlük %10 mevduat faizi, günlük %12 kredi faizi (kredi her zaman mevduattan pahalı), 1–3 günlük vade. Kredi sınırı net değerin yarısı (en az $2.000). Vadesinde ödenmeyen kredi kasadan çekilir; kasa yetmezse itibar −10, 24 saat kredi yasağı ve haber.
- **Mülkler:** ev, araba, saat, tekne, jet. İtibar ve partner yakınlığı verir; değerinin %70'i net değere sayılır ve o fiyata geri satılır.
- **Oyuncular arası anlaşmalar:** toptan satış (alıcıya "(bayi)" modeli kopyalanır), borç (vade sonunda otomatik tahsil, ödenmezse itibar −10) ve gelir ortaklığı (PC satış gelirinin bir yüzdesi, toplamda en fazla %50). Teklifler 24 saat geçerli.

## Profil ve görseller

- `/sirket/[id]`: şirketin künyesi, net değer, itibar, sıra, satıştaki ürünleri, hakkındaki paylaşımlar, partneri, ekibi ve mülkleri. Buradan posta gönderilir ve anlaşma teklif edilir.
- Oyuncular kuruluşta ya da Ofis'teki "Portre ve logo" kartından PNG, JPEG ya da WebP yükleyebilir (en fazla 1 MB, günde 10). Dosya türü uzantıdan değil içeriğin ilk baytlarından anlaşılır. Yüklemeler PixelLab hakkından düşmez.
- Yönetici panelindeki "Görselleri kaldır" şirketi sade çizime döndürür.

## Sosyal medya ve itibar

- Oyuncular da paylaşım yapabilir (saatte 10), beğenebilir ve yorum yazabilir (saatte 30). Herkes kendi paylaşımını ve yorumunu silebilir; kurgusal hesapların haberlerini yalnızca yönetici siler.

- `src/lib/server/social.ts` — kurgusal hesaplar (@fiyatavcisi, @donanimcanavari, @teknogundem, @magazinekspres, @piyasakulisi). Fahiş/pahalı/uygun etiket, maliyet altı satış, darboğaz, satış eşikleri, tükenme, ilişki olayları, fidye saldırısı ve ihale kazanımı paylaşım üretir.
- Her paylaşımın itibar etkisi vardır (−5 … +3). İtibar 0–100, başlangıç 50; satış hızını ve hak edilen fiyatı etkiler. Fiyat tepkisi model başına 30 dakikada en fazla bir kez gelir.
- Şablonlarda değişkenlere Türkçe ek eklenmez (ek, ismin sesine göre değişir).

## Hayat

- `src/lib/game/life.ts` — 12 kurgusal yetişkin karakter; her birinin mesleği, sevdiği/sevmediği şeyler ve şirkete yararı var.
- Basamaklar: tanışık (0) → arkadaş (20) → flört (40) → sevgili (60) → nişanlı (yüzük + teklif, 80+ yakınlıkta şansa bağlı) → evli (düğün).
- Aynı anda tek romantik ilişki. Yakınlık her 8 saatte 1 azalır; nişan/evlilikte 40'ın altına düşmez. Etkinlik bekleme süresi 20 dk, davet 60 dk.
- Arkadaş ve üstü kişilerin yararları toplanır, partnerinki iki kat: teklif başarısı, kriz kalkanı, basın, parça indirimi, PC talebi (üst sınırlı).

## Para hareketlerinde kural: oku-değiştir-yaz yok

Bir işlemin kontrolü (bakiye, sınır, "açık kredi var mı") ve para hareketi aynı veritabanı fonksiyonunda, satır kilidi altında yapılmalı. İstemciden okunan durumu JS'te değiştirip geri yazmak, aynı anda gönderilen isteklerde istismara açıktır. 013'te kapatılan örnekler: paralel kredi çekme (kasaya 12 kredi, kayda 1 kredi), mevduatın paralel olarak birden çok kez çekilmesi, gizli operasyon sınırlarının paralel isteklerle aşılması. Banka işlemleri artık `bank_op`, operasyonlar `ops_reserve` üzerinden yapılır. Vadede önce kasa, sonra mevduat tahsil edilir; yetmeyen kısım silinmez, borç olarak kalır.

## Bilinen tuzak: Next.js önbelleği

Next.js 14, yalnızca GET içeren route'lardaki `fetch` isteklerini kalıcı olarak önbelleğe alır. Supabase istemcisi bu yüzden `cache: "no-store"` ile kurulur ve her API route'u `fetchCache = "force-no-store"` dışa aktarır. Yeni route eklerken bu satırı unutma.

## Mimari

- `src/lib/game/config.ts` — tüm denge değerleri (ekipmanlar, başlangıç sermayesi, çevrimdışı sınır).
- `src/lib/game/economy.ts` — saf hesaplama fonksiyonları; hem sunucu hem istemci kullanır.
- `src/app/api/*` — sunucu yetkilidir: nakit ve gelir hesabını istemci değil sunucu yapar, hile yapılamaz.
- Gelir "lazy" hesaplanır: son toplama zamanından beri geçen süre × saatlik gelir (en fazla 12 saat).
- Satın alma, `apply_purchase` SQL fonksiyonuyla atomiktir; `version` alanı çifte harcamayı engeller.
- Tablolarda RLS açık ve politika yok: istemci veritabanına doğrudan erişemez.

### Borsa

- `src/lib/game/market.ts` — hisseler, komisyon (%0,5), ortak hesaplar.
- `src/lib/server/market.ts` — fiyat modeli (yalnızca sunucu). Fiyatlar veritabanına yazılmaz; gizli bir tohumdan dakikalık tikler halinde deterministik hesaplanır. 18 Ekim 2026 00:15'ten (İstanbul) önceki geçmiş eski 5 dakikalık modelden gelir; geçişte fiyat sıçramaz. Böylece herkes aynı fiyatı görür, cron gerekmez, gelecek fiyatlar tahmin edilemez.
- Model: ortalamaya dönen gürültü + günler/haftalar süren döngüler + hafif uzun vadeli büyüme + ara sıra haber şokları. Şoklar haber akışında başlık olarak görünür.
- 18 Ekim 2026 03:00'ten (İstanbul) itibaren fiyatlar 20 saniyede bir değişir ve üstüne bir hareket katmanı eklenir: hızlı dalgalanma (yarı ömür ≈ 1 saat) ve %5–30 arası ani sıçrama/çöküşler (8 hissede haftada ≈ 130; birkaç saatte kısmen geri döner). Katman o anda sıfırdan başladığı için geçişte fiyat kopmaz.
- Tohum `MARKET_SEED` ortam değişkeninden okunur; yoksa service role anahtarından türetilir. **Tohumu değiştirmek tüm fiyat geçmişini değiştirir**, yayındayken dokunma.
- Net değer = nakit + ekipman değeri (%50) + portföyün güncel piyasa değeri.

## Ekranlar

| Yol | İçerik |
|---|---|
| `/` | Giriş / kayıt |
| `/kurulus` | Kurucu adı, şirket adı, logo ve karakter oluşturma |
| `/oyun` | Ofis, Üretim, Borsa, Finans, Posta, Hayat, Gündem |
| `/sirket/[id]` | Şirket profili |
| `/admin` | Oyuncu listesi, nakit ekle/düş, askıya al, görselleri kaldır, şirket sil, sezonu bitir |

## Yol haritası

- [x] Çekirdek döngü: şirket kur, ekipman al, gelir topla, sıralama
- [x] Yönetici paneli
- [x] PixelLab ile piksel portre ve arma, şirket günlüğü, kariyer basamakları
- [x] Dakikalık borsa, hızlı gelir, iş teklifleri ve senaryolar, şirketler arası posta
- [x] Kompakt arayüz, PC Atölyesi, sosyal medya ve itibar, Hayat (ilişkiler)
- [x] Ortak PC pazarı, dünya olayları, sezonlar ve şeref listesi
- [x] Oyuncular arası anlaşmalar, çalışanlar, banka, mülkler
- [x] Şirket profili, görsel yükleme, oyuncu paylaşımları
- [x] Borsa: otomotiv, savunma, denizcilik, havacılık, enerji, yarı iletken, lojistik, telekom hisseleri
- [x] İhaleler ve Ar-Ge
- [x] Tesis büyütme ve şirkete özel krizler
- [x] Halka arz ve gizli operasyonlar
- [ ] Ar-Ge
- [ ] Mobil sürüm (Capacitor ile Android/iOS)
- [x] Kulüp: masa oyunları, piyasa bahsi, bahis bürosu
- [ ] Satın alma ve birleşme, temettü
