-- 009: İhaleler ve Ar-Ge. 008'den SONRA bir kez çalıştır.

-- ---- İhaleler ----
-- Şartnameler sunucuda gizli bir tohumdan üretilir ve ilk ihtiyaç anında buraya yazılır.
create table if not exists public.tenders (
  id text primary key,                       -- dilim numarası
  buyer text not null,
  title text not null,
  parts jsonb not null,                      -- her parça için en düşük kalite
  qty int not null check (qty > 0),
  budget bigint not null check (budget > 0), -- birim başına en yüksek fiyat
  rival_name text not null,
  rival_price bigint not null,               -- kurgusal rakibin kapalı zarfı (sonuçta açıklanır)
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'settled')),
  winner_company uuid references public.companies(id) on delete set null,
  winner_name text,
  winner_price bigint,
  settled_at timestamptz
);
create index if not exists tenders_status_idx on public.tenders (status, closes_at);
alter table public.tenders enable row level security;

create table if not exists public.tender_bids (
  tender_id text not null references public.tenders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  model_id uuid not null references public.pc_models(id) on delete cascade,
  unit_price bigint not null check (unit_price > 0),
  bond bigint not null check (bond >= 0),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'failed')),
  created_at timestamptz not null default now(),
  primary key (tender_id, company_id)
);
create index if not exists tender_bids_company_idx on public.tender_bids (company_id, created_at desc);
alter table public.tender_bids enable row level security;

create or replace function public.q_rank(q text) returns int language sql immutable as $$
  select case q when 'low' then 0 when 'mid' then 1 when 'high' then 2 else -1 end
$$;

-- Model şartnameyi karşılıyor mu (her parça en az istenen kalitede)
create or replace function public.meets_spec(p_parts jsonb, p_spec jsonb) returns boolean language sql immutable as $$
  select bool_and(public.q_rank(p_parts ->> k) >= public.q_rank(p_spec ->> k))
    from unnest(array['cpu', 'gpu', 'ram', 'ssd']) as k
$$;

-- Teklif ver ya da güncelle: teminat kasadan alınır (eski teklifin teminatı iade edilir).
create or replace function public.tender_bid(p_tender text, p_company uuid, p_model uuid, p_price bigint, p_bond bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  old_bond bigint;
begin
  perform 1 from public.tenders where id = p_tender and status = 'open' and closes_at > now() for share;
  if not found then raise exception 'İhale kapandı'; end if;
  perform 1 from public.pc_models where id = p_model and company_id = p_company;
  if not found then raise exception 'Model bulunamadı'; end if;
  select bond into old_bond from public.tender_bids where tender_id = p_tender and company_id = p_company and status = 'pending' for update;
  update public.companies set cash = cash + coalesce(old_bond, 0) - p_bond, version = version + 1
   where id = p_company and cash + coalesce(old_bond, 0) >= p_bond;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.tender_bids (tender_id, company_id, model_id, unit_price, bond)
  values (p_tender, p_company, p_model, p_price, p_bond)
  on conflict (tender_id, company_id) do update
    set model_id = excluded.model_id, unit_price = excluded.unit_price, bond = excluded.bond, created_at = now(), status = 'pending';
  return true;
end;
$$;

-- Teklifi geri çek: teminat iade.
create or replace function public.tender_withdraw(p_tender text, p_company uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  b bigint;
begin
  perform 1 from public.tenders where id = p_tender and status = 'open' and closes_at > now() for share;
  if not found then raise exception 'İhale kapandı'; end if;
  delete from public.tender_bids where tender_id = p_tender and company_id = p_company and status = 'pending' returning bond into b;
  if b is null then return false; end if;
  update public.companies set cash = cash + b, version = version + 1 where id = p_company;
  return true;
end;
$$;

-- Süresi dolan ihaleyi sonuçlandır. Puan = birim fiyat × (1,2 − itibar / 250); en düşük puan kazanır.
-- Kazanan teslim edemezse (stok yok / model şartnameye uymuyor) teminatını ve 6 itibar kaybeder, sıra bir sonrakine geçer.
-- Kurgusal rakip daha iyiyse ihaleyi o alır; bekleyen bütün teminatlar iade edilir.
create or replace function public.settle_tender(p_tender text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.tenders%rowtype;
  b record;
  m public.pc_models%rowtype;
  rival_score double precision;
  win_company uuid;
  win_name text;
  win_price bigint;
  failed jsonb := '[]'::jsonb;
  losers jsonb := '[]'::jsonb;
begin
  select * into t from public.tenders where id = p_tender for update;
  if not found or t.status <> 'open' or t.closes_at > now() then return null; end if;
  rival_score := t.rival_price * (1.2 - 60 / 250.0);

  for b in
    select tb.*, c.reputation, c.name as cname
      from public.tender_bids tb join public.companies c on c.id = tb.company_id
     where tb.tender_id = p_tender and tb.status = 'pending'
     order by tb.unit_price * (1.2 - c.reputation / 250.0), tb.created_at
  loop
    exit when b.unit_price * (1.2 - b.reputation / 250.0) >= rival_score;
    select * into m from public.pc_models where id = b.model_id for update;
    if found and m.company_id = b.company_id and m.stock >= t.qty and public.meets_spec(m.parts, t.parts) then
      update public.pc_models set stock = stock - t.qty, sold_total = sold_total + t.qty where id = m.id;
      update public.companies
         set cash = cash + t.qty::bigint * b.unit_price + b.bond, reputation = least(100, reputation + 3), version = version + 1
       where id = b.company_id;
      update public.tender_bids set status = 'won' where tender_id = p_tender and company_id = b.company_id;
      win_company := b.company_id;
      win_name := b.cname;
      win_price := b.unit_price;
      exit;
    end if;
    -- Teslim edemedi: teminat yanar
    update public.companies set reputation = greatest(0, reputation - 6), version = version + 1 where id = b.company_id;
    update public.tender_bids set status = 'failed' where tender_id = p_tender and company_id = b.company_id;
    failed := failed || jsonb_build_object('company', b.company_id, 'name', b.cname, 'bond', b.bond);
  end loop;

  -- Kalan teklifler: teminat iade
  for b in select * from public.tender_bids where tender_id = p_tender and status = 'pending' loop
    update public.companies set cash = cash + b.bond, version = version + 1 where id = b.company_id;
    losers := losers || jsonb_build_object('company', b.company_id, 'bond', b.bond);
  end loop;
  update public.tender_bids set status = 'lost' where tender_id = p_tender and status = 'pending';

  if win_company is null then
    win_name := t.rival_name;
    win_price := t.rival_price;
  end if;
  update public.tenders
     set status = 'settled', winner_company = win_company, winner_name = win_name, winner_price = win_price, settled_at = now()
   where id = p_tender;

  return jsonb_build_object('winner', win_company, 'name', win_name, 'price', win_price, 'qty', t.qty, 'title', t.title, 'buyer', t.buyer, 'failed', failed, 'losers', losers);
end;
$$;

-- ---- Ar-Ge ----
create table if not exists public.research (
  company_id uuid not null references public.companies(id) on delete cascade,
  tech_id text not null,
  started_at timestamptz not null default now(),
  done_at timestamptz not null,
  cost bigint not null default 0,
  announced boolean not null default false, -- tamamlanma haberi verildi mi
  primary key (company_id, tech_id)
);
create index if not exists research_tech_idx on public.research (tech_id, done_at);
alter table public.research enable row level security;

-- Projeyi başlat: aynı anda tek proje, bedel peşin.
create or replace function public.research_start(p_company uuid, p_tech text, p_cost bigint, p_hours double precision)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.companies where id = p_company for update;
  if exists (select 1 from public.research where company_id = p_company and done_at > now()) then
    raise exception 'Devam eden proje var';
  end if;
  update public.companies set cash = cash - p_cost, version = version + 1 where id = p_company and cash >= p_cost;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.research (company_id, tech_id, done_at, cost)
  values (p_company, p_tech, now() + make_interval(secs => p_hours * 3600), p_cost);
  return true;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'tender_bid(text, uuid, uuid, bigint, bigint)',
    'tender_withdraw(text, uuid)',
    'settle_tender(text)',
    'research_start(uuid, text, bigint, double precision)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
