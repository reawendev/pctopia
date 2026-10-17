# PCTopia

Çok oyunculu bilgisayar şirketi tycoon oyunu. Şimdilik yalnızca web; mobil (Capacitor) ilk sürüm oturduktan sonra eklenecek.

**Stack:** Next.js 14 (App Router) · Supabase (auth + Postgres) · Tailwind

## Kurulum

1. Supabase'de yeni proje aç. **SQL Editor**'e `supabase/schema.sql` dosyasını yapıştırıp çalıştır.
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

Vercel'e bağla, aynı üç ortam değişkenini (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) ekle.

## Mimari

- `src/lib/game/config.ts` — tüm denge değerleri (ekipmanlar, başlangıç sermayesi, çevrimdışı sınır).
- `src/lib/game/economy.ts` — saf hesaplama fonksiyonları; hem sunucu hem istemci kullanır.
- `src/app/api/*` — sunucu yetkilidir: nakit ve gelir hesabını istemci değil sunucu yapar, hile yapılamaz.
- Gelir "lazy" hesaplanır: son toplama zamanından beri geçen süre × saatlik gelir (en fazla 12 saat).
- Satın alma, `apply_purchase` SQL fonksiyonuyla atomiktir; `version` alanı çifte harcamayı engeller.
- Tablolarda RLS açık ve politika yok: istemci veritabanına doğrudan erişemez.

## Ekranlar

| Yol | İçerik |
|---|---|
| `/` | Giriş / kayıt |
| `/kurulus` | Kurucu adı, şirket adı, logo ve karakter oluşturma |
| `/oyun` | Genel (gelir toplama), Ekipman (8 kademe), Sıralama |
| `/admin` | Oyuncu listesi, nakit ekle/düş, askıya al, şirket sil |

## Yol haritası

- [x] Çekirdek döngü: şirket kur, ekipman al, gelir topla, sıralama
- [x] Yönetici paneli
- [ ] Yatırım sistemi: otomotiv, savunma sanayii, denizcilik vb. sektörler; şans + şirket başarısına bağlı getiri/kayıp
- [ ] Piyasa olayları (kriz, talep patlaması)
- [ ] Çalışanlar ve Ar-Ge
- [ ] Mobil sürüm (Capacitor ile Android/iOS)
- [ ] Oyuncular arası etkileşim (ihale, satın alma teklifi)
