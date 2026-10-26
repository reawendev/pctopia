-- 014: Web bildirimleri (push). 013'ten SONRA bir kez çalıştır.
--
-- push_subscriptions: her cihazın tarayıcı aboneliği (bir oyuncunun birden çok cihazı olabilir)
-- push_state: oyuncu başına son kontrol ve son görülme zamanı. Oyun açıkken bildirim gönderilmez.
-- Tablolara yalnızca sunucu (service role) erişir.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create table if not exists public.push_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_checked timestamptz,
  last_seen timestamptz
);
alter table public.push_state enable row level security;

-- ---------------------------------------------------------------------------
-- Zamanlayıcı: her 2 dakikada bir sitedeki /api/cron/push adresini çağırır.
-- Önce Database > Extensions'tan pg_cron ve pg_net'i aç (ya da aşağıdaki iki satır açar).
-- 'CRON_SECRET_BURAYA' yerine Vercel'e eklediğin CRON_SECRET değerini yaz.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('pctopia-push') where exists (select 1 from cron.job where jobname = 'pctopia-push');
select cron.schedule(
  'pctopia-push',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://pctopia.vercel.app/api/cron/push',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET_BURAYA', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
