-- 003: PixelLab görselleri ve şirket günlüğü. 002'den SONRA bir kez çalıştır.

-- Üretilen görseller için herkese açık okuma izni olan depo
insert into storage.buckets (id, name, public)
values ('generated', 'generated', true)
on conflict (id) do update set public = true;

alter table public.companies add column if not exists portrait_url text;
alter table public.companies add column if not exists logo_url text;

-- Her üretim kaydı (kişi başı günlük sınır ve maliyet takibi için)
create table if not exists public.asset_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('portrait', 'logo')),
  path text not null,
  url text not null,
  prompt text not null,
  cost_usd numeric(10, 4),
  created_at timestamptz not null default now()
);
create index if not exists asset_generations_user_idx on public.asset_generations (user_id, kind, created_at desc);
alter table public.asset_generations enable row level security;

-- Şirket günlüğü (roleplay akışı)
create table if not exists public.company_events (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  text text not null,
  amount bigint,
  created_at timestamptz not null default now()
);
create index if not exists company_events_company_idx on public.company_events (company_id, created_at desc);
alter table public.company_events enable row level security;
