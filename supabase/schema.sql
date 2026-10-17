-- PCTopia veritabanı şeması. Supabase > SQL Editor'e yapıştırıp çalıştır.
-- Tüm oyun erişimi sunucu (service role) üzerinden yapılır; istemci tablolara doğrudan erişemez.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 28),
  founder_name text not null check (char_length(founder_name) between 2 and 24),
  logo jsonb not null,
  character jsonb not null,
  cash bigint not null default 1000 check (cash >= 0),
  last_collected_at timestamptz not null default now(),
  version int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists companies_name_lower_idx on public.companies (lower(name));

create table if not exists public.company_equipment (
  company_id uuid not null references public.companies(id) on delete cascade,
  equipment_id text not null,
  qty int not null default 0 check (qty >= 0),
  primary key (company_id, equipment_id)
);

-- RLS açık, politika yok: anon/authenticated roller hiçbir şey okuyamaz/yazamaz.
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_equipment enable row level security;

-- Yeni kullanıcı için profil satırı
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomik satın alma: nakit + toplama zamanı + ekipman adedi tek işlemde güncellenir.
-- p_version ile eşzamanlı isteklerde çifte harcama engellenir (false dönerse tekrar dene).
create or replace function public.apply_purchase(
  p_company uuid,
  p_version int,
  p_new_cash bigint,
  p_equipment text,
  p_new_qty int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  updated int;
begin
  update public.companies
     set cash = p_new_cash,
         last_collected_at = now(),
         version = version + 1
   where id = p_company and version = p_version;
  get diagnostics updated = row_count;
  if updated = 0 then
    return false;
  end if;

  insert into public.company_equipment (company_id, equipment_id, qty)
  values (p_company, p_equipment, p_new_qty)
  on conflict (company_id, equipment_id) do update set qty = excluded.qty;

  return true;
end;
$$;

revoke all on function public.apply_purchase(uuid, int, bigint, text, int) from public, anon, authenticated;
grant execute on function public.apply_purchase(uuid, int, bigint, text, int) to service_role;

-- İlk yöneticiyi atamak için (e-postanı yaz):
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'senin@epostan.com');
