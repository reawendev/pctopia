# PCTopia

Çok oyunculu bilgisayar şirketi tycoon oyunu. Şimdilik yalnızca web; mobil (Capacitor) ilk sürüm oturduktan sonra eklenecek.

**Stack:** Next.js 14 (App Router) · Supabase (auth + Postgres) · Tailwind

## Kurulum

1. Supabase'de yeni proje aç. **SQL Editor**'de sırayla çalıştır:
   - `supabase/schema.sql`
   - `supabase/migrations/002_borsa.sql`
   - `supabase/migrations/003_gorseller_gunluk.sql`
   - `supabase/migrations/004_teklifler_posta.sql`

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

## Teklifler ve senaryolar

- `src/lib/server/offers.ts` — 9 senaryo şablonu (bakım sözleşmesi, kamu ihalesi, acil müdahale, iflas stoğu, melek yatırımcı, fidye yazılımı krizi, banka konsorsiyumu, röportaj, yetenek transferi).
- Her 20 dakikada bir yeni teklif, aynı anda en fazla 3 açık teklif; yanıtlanmayan teklif 2 saatte düşer. Kriz yanıtsız kalırsa "görmezden gel" sonucu uygulanır.
- Ödüller şirketin saatlik gelirine göre ölçeklenir (en az $200). Başarı şansı, en yüksek donanım kademesi ve kariyer basamağıyla artar (en fazla +%15).
- Teklifler sayfa açıkken 30 saniyede bir `/api/inbox` ile güncellenir; nakit değişiklikleri `accept_offer` / `settle_offer` SQL fonksiyonlarıyla atomik ve tek seferliktir.

## Posta

- Şirketler birbirine konu + metin (en fazla 2000 karakter) gönderebilir; saatte 20 posta sınırı vardır. Gelen kutusu teklifleri ve mesajları birlikte gösterir; okunmamış sayısı Posta sekmesinde rozet olarak görünür.

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
- Tohum `MARKET_SEED` ortam değişkeninden okunur; yoksa service role anahtarından türetilir. **Tohumu değiştirmek tüm fiyat geçmişini değiştirir**, yayındayken dokunma.
- Net değer = nakit + ekipman değeri (%50) + portföyün güncel piyasa değeri.

## Ekranlar

| Yol | İçerik |
|---|---|
| `/` | Giriş / kayıt |
| `/kurulus` | Kurucu adı, şirket adı, logo ve karakter oluşturma |
| `/oyun` | Genel (gelir toplama), Ekipman (8 kademe), Borsa (8 hisse, al-sat, haberler), Sıralama |
| `/admin` | Oyuncu listesi, nakit ekle/düş, askıya al, şirket sil |

## Yol haritası

- [x] Çekirdek döngü: şirket kur, ekipman al, gelir topla, sıralama
- [x] Yönetici paneli
- [x] PixelLab ile piksel portre ve arma, şirket günlüğü, kariyer basamakları
- [x] Dakikalık borsa, 4 kat hızlı gelir, iş teklifleri ve senaryolar, şirketler arası posta
- [x] Borsa: otomotiv, savunma, denizcilik, havacılık, enerji, yarı iletken, lojistik, telekom hisseleri
- [ ] Şirket başarısına bağlı yatırımlar (süreli büyük projeler, ihaleler)
- [ ] Piyasa olayları (kriz, talep patlaması)
- [ ] Çalışanlar ve Ar-Ge
- [ ] Mobil sürüm (Capacitor ile Android/iOS)
- [ ] Oyuncular arası etkileşim (ihale, satın alma teklifi)
