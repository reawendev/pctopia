-- 010: Tesis büyütme ve kriz etkileri. 009'dan SONRA bir kez çalıştır.

-- ---- Tesis ----
alter table public.companies add column if not exists facility_level int not null default 1;
alter table public.companies add column if not exists facility_target int;            -- inşaatı süren seviye
alter table public.companies add column if not exists facility_ready_at timestamptz;   -- inşaatın biteceği an

-- Depo sınırı artık tesise bağlı: eski sabit 500 kısıtı kalkar (sınırı produce_pc uygular)
alter table public.pc_models drop constraint if exists pc_models_stock_check;
alter table public.pc_models add constraint pc_models_stock_check check (stock >= 0 and stock <= 20000);

-- Etkin seviye: inşaat bittiyse hedef seviye sayılır (tembel tamamlama)
create or replace function public.facility_of(p_company uuid) returns int language sql stable as $$
  select case when facility_target is not null and facility_ready_at <= now() then facility_target else facility_level end
    from public.companies where id = p_company
$$;

-- Seviyeye göre sınırlar (src/lib/game/facility.ts ile aynı)
create or replace function public.facility_max_stock(p_level int) returns int language sql immutable as $$
  select (array[500, 1000, 2000, 4000, 8000, 20000])[greatest(1, least(6, p_level))]
$$;
create or replace function public.facility_max_models(p_level int) returns int language sql immutable as $$
  select (array[5, 5, 6, 7, 8, 10])[greatest(1, least(6, p_level))]
$$;

-- İnşaat başlat: bir üst seviye, bedel peşin
create or replace function public.facility_upgrade(p_company uuid, p_target int, p_cost bigint, p_hours double precision)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  c public.companies%rowtype;
begin
  select * into c from public.companies where id = p_company for update;
  -- Biten inşaatı önce kesinleştir
  if c.facility_target is not null and c.facility_ready_at <= now() then
    c.facility_level := c.facility_target;
    c.facility_target := null;
  end if;
  if c.facility_target is not null then raise exception 'İnşaat sürüyor'; end if;
  if p_target <> c.facility_level + 1 then raise exception 'Seviye geçersiz'; end if;
  if c.cash < p_cost then raise exception 'Yetersiz nakit'; end if;
  update public.companies
     set cash = cash - p_cost, facility_level = c.facility_level, facility_target = p_target,
         facility_ready_at = now() + make_interval(secs => p_hours * 3600), version = version + 1
   where id = p_company;
  return true;
end;
$$;

-- Biten inşaatı kesinleştir (duyuru için bir kez true döner)
create or replace function public.facility_finish(p_company uuid) returns int language plpgsql security definer set search_path = public as $$
declare
  lvl int;
begin
  update public.companies set facility_level = facility_target, facility_target = null, facility_ready_at = null
   where id = p_company and facility_target is not null and facility_ready_at <= now()
  returning facility_level into lvl;
  return lvl;
end;
$$;

-- Üretim: depo sınırı tesis seviyesine bağlı (imza aynı kaldı)
create or replace function public.produce_pc(p_company uuid, p_model uuid, p_qty int, p_cost bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  cap int := public.facility_max_stock(public.facility_of(p_company));
begin
  update public.companies set cash = cash - p_cost, version = version + 1 where id = p_company and cash >= p_cost;
  if not found then raise exception 'Yetersiz nakit'; end if;
  update public.pc_models set stock = stock + p_qty where id = p_model and company_id = p_company and stock + p_qty <= cap;
  if not found then raise exception 'Stok sınırı'; end if;
  return true;
end;
$$;

-- Toptan satış: alıcının model ve depo sınırı tesis seviyesine bağlı (imza aynı kaldı)
create or replace function public.deal_accept_wholesale(
  p_deal uuid, p_buyer uuid, p_seller uuid, p_model uuid, p_qty int, p_total bigint, p_clone_name text, p_parts jsonb, p_clone_price bigint
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  clone uuid;
  lvl int := public.facility_of(p_buyer);
begin
  update public.deals set status = 'completed', accepted_at = now(), settled_at = now()
   where id = p_deal and status = 'pending' and expires_at > now();
  if not found then return false; end if;

  update public.pc_models set stock = stock - p_qty where id = p_model and company_id = p_seller and stock >= p_qty;
  if not found then raise exception 'Satıcının stoğu yetersiz'; end if;
  perform public.transfer_cash(p_buyer, p_seller, p_total, false);

  select id into clone from public.pc_models where company_id = p_buyer and name = p_clone_name for update;
  if clone is null then
    if (select count(*) from public.pc_models where company_id = p_buyer) >= public.facility_max_models(lvl) then
      raise exception 'Alıcının model sınırı dolu';
    end if;
    if p_qty > public.facility_max_stock(lvl) then raise exception 'Alıcının deposu dolu'; end if;
    insert into public.pc_models (company_id, name, parts, price, stock, listed)
    values (p_buyer, p_clone_name, p_parts, p_clone_price, p_qty, false);
  else
    update public.pc_models set stock = stock + p_qty where id = clone and stock + p_qty <= public.facility_max_stock(lvl);
    if not found then raise exception 'Alıcının deposu dolu'; end if;
  end if;
  return true;
end;
$$;

-- ---- Süreli etkiler (krizler, ileride operasyonlar) ----
-- kind: demand (PC çekiciliği, −1 = satış durdu), parts (maliyet artışı), halt (üretim durdu)
create table if not exists public.company_effects (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('demand', 'parts', 'halt')),
  value double precision not null default 0,
  label text not null,
  source text not null default 'kriz',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists company_effects_idx on public.company_effects (company_id, expires_at);
alter table public.company_effects enable row level security;

do $$
declare f text;
begin
  foreach f in array array[
    'facility_upgrade(uuid, int, bigint, double precision)',
    'facility_finish(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
