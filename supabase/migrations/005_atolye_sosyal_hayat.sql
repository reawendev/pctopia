-- 005: PC Atölyesi, sosyal medya, itibar ve Hayat (ilişkiler). 004'ten SONRA bir kez çalıştır.

alter table public.companies add column if not exists reputation int not null default 50;
alter table public.companies drop constraint if exists companies_reputation_range;
alter table public.companies add constraint companies_reputation_range check (reputation between 0 and 100);
alter table public.companies add column if not exists last_meet_at timestamptz;

-- Oyuncunun tasarladığı PC modelleri
create table if not exists public.pc_models (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  parts jsonb not null,
  price bigint not null check (price > 0),
  stock int not null default 0 check (stock between 0 and 500),
  sold_total int not null default 0,
  sale_carry double precision not null default 0,
  last_sale_at timestamptz not null default now(),
  listed boolean not null default false,
  last_post_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pc_models_company_idx on public.pc_models (company_id);
alter table public.pc_models enable row level security;

-- Ortak sosyal medya akışı
create table if not exists public.social_posts (
  id bigserial primary key,
  company_id uuid references public.companies(id) on delete set null,
  event text not null,
  author text not null,
  handle text not null,
  text text not null,
  rep_delta int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists social_posts_created_idx on public.social_posts (created_at desc);
create index if not exists social_posts_company_idx on public.social_posts (company_id, created_at desc);
alter table public.social_posts enable row level security;

-- İlişkiler (kurgusal karakterlerle)
create table if not exists public.relationships (
  company_id uuid not null references public.companies(id) on delete cascade,
  npc_id text not null,
  affection int not null default 5 check (affection between 0 and 100),
  engaged boolean not null default false,
  married boolean not null default false,
  last_activity_at timestamptz not null default now(), -- yakınlığın azalması bundan sayılır
  last_date_at timestamptz,                             -- etkinlik bekleme süresi bundan sayılır
  met_at timestamptz not null default now(),
  primary key (company_id, npc_id)
);
alter table public.relationships enable row level security;

-- İtibarı 0–100 aralığında değiştirir
create or replace function public.adjust_reputation(p_company uuid, p_delta int)
returns void language sql security definer set search_path = public as $$
  update public.companies set reputation = least(100, greatest(0, reputation + p_delta)) where id = p_company;
$$;

-- Üretim: nakit yeterliyse düşer ve stoğa ekler (ikisi birlikte ya da hiçbiri)
create or replace function public.produce_pc(p_company uuid, p_model uuid, p_qty int, p_cost bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.companies set cash = cash - p_cost, version = version + 1 where id = p_company and cash >= p_cost;
  if not found then raise exception 'Yetersiz nakit'; end if;
  update public.pc_models set stock = stock + p_qty where id = p_model and company_id = p_company and stock + p_qty <= 500;
  if not found then raise exception 'Stok sınırı'; end if;
  return true;
end;
$$;

-- Satış mutabakatı: yalnızca bir kez uygulanır (last_sale_at iyimser kilit)
create or replace function public.settle_sales(
  p_model uuid, p_last timestamptz, p_now timestamptz, p_sold int, p_revenue bigint, p_carry double precision
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  update public.pc_models
     set stock = stock - p_sold, sold_total = sold_total + p_sold, sale_carry = p_carry, last_sale_at = p_now
   where id = p_model and last_sale_at = p_last and stock >= p_sold
  returning company_id into cid;
  if cid is null then return false; end if;
  if p_revenue > 0 then
    update public.companies set cash = cash + p_revenue, version = version + 1 where id = cid;
  end if;
  return true;
end;
$$;

-- Hayat: masrafı öder ve ilişkiyi günceller (ya da yeni tanışma kaydı açar)
create or replace function public.life_apply(
  p_company uuid, p_npc text, p_cost bigint, p_affection int, p_engaged boolean, p_married boolean, p_meet boolean, p_date boolean
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_cost > 0 then
    update public.companies set cash = cash - p_cost, version = version + 1 where id = p_company and cash >= p_cost;
    if not found then raise exception 'Yetersiz nakit'; end if;
  end if;
  insert into public.relationships (company_id, npc_id, affection, engaged, married, last_activity_at, last_date_at)
  values (p_company, p_npc, p_affection, p_engaged, p_married, now(), case when p_date then now() end)
  on conflict (company_id, npc_id) do update
    set affection = excluded.affection, engaged = excluded.engaged, married = excluded.married, last_activity_at = now(),
        last_date_at = case when p_date then now() else public.relationships.last_date_at end;
  if p_meet then
    update public.companies set last_meet_at = now() where id = p_company;
  end if;
  return true;
end;
$$;

revoke all on function public.adjust_reputation(uuid, int) from public, anon, authenticated;
revoke all on function public.produce_pc(uuid, uuid, int, bigint) from public, anon, authenticated;
revoke all on function public.settle_sales(uuid, timestamptz, timestamptz, int, bigint, double precision) from public, anon, authenticated;
revoke all on function public.life_apply(uuid, text, bigint, int, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.adjust_reputation(uuid, int) to service_role;
grant execute on function public.produce_pc(uuid, uuid, int, bigint) to service_role;
grant execute on function public.settle_sales(uuid, timestamptz, timestamptz, int, bigint, double precision) to service_role;
grant execute on function public.life_apply(uuid, text, bigint, int, boolean, boolean, boolean, boolean) to service_role;
