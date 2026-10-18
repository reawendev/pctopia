-- 011: Halka arz (oyuncu şirket hisseleri) ve gizli operasyonlar. 010'dan SONRA bir kez çalıştır.

-- ---- Halka arz ----
-- Her şirket 1.000 kurucu hissesiyle başlar. Halka arzda YENİ hisse basılır: kasaya para girer,
-- kurucunun oranı düşer. Basılan hisseler önce "piyasada" (kurgusal yatırımcılarda) durur;
-- oyuncular buradan alır, satınca geri döner. Fiyatı sunucu, şirketin değerinden hesaplar.
alter table public.companies add column if not exists shares_total int not null default 1000 check (shares_total >= 1000);
alter table public.companies add column if not exists founder_shares int not null default 1000 check (founder_shares >= 0);
alter table public.companies add column if not exists ipo_at timestamptz;

create table if not exists public.player_holdings (
  holder uuid not null references public.companies(id) on delete cascade,
  target uuid not null references public.companies(id) on delete cascade,
  shares int not null check (shares >= 0),
  cost_basis bigint not null default 0,
  primary key (holder, target),
  check (holder <> target)
);
create index if not exists player_holdings_target_idx on public.player_holdings (target);
alter table public.player_holdings enable row level security;

-- Piyasadaki serbest hisse: toplam − kurucu − oyuncuların elindeki
create or replace function public.equity_float(p_company uuid) returns int language sql stable as $$
  select c.shares_total - c.founder_shares - coalesce((select sum(shares) from public.player_holdings where target = p_company), 0)::int
    from public.companies c where c.id = p_company
$$;

-- Halka arz / ek ihraç: yeni hisse bas, kasaya ekle. Kurucu en az %51'de kalmalı.
create or replace function public.equity_issue(p_company uuid, p_shares int, p_cash bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  c public.companies%rowtype;
begin
  select * into c from public.companies where id = p_company for update;
  if p_shares < 1 then raise exception 'Adet geçersiz'; end if;
  if c.founder_shares::double precision / (c.shares_total + p_shares) < 0.51 then raise exception 'Kontrol payı'; end if;
  update public.companies
     set shares_total = shares_total + p_shares, cash = cash + p_cash, ipo_at = coalesce(ipo_at, now()), version = version + 1
   where id = p_company;
  return true;
end;
$$;

-- Geri alım: şirket piyasadaki kendi hissesini alıp iptal eder.
create or replace function public.equity_buyback(p_company uuid, p_shares int, p_cost bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.companies where id = p_company for update;
  if public.equity_float(p_company) < p_shares then raise exception 'Piyasada yeterli hisse yok'; end if;
  update public.companies set shares_total = shares_total - p_shares, cash = cash - p_cost, version = version + 1
   where id = p_company and cash >= p_cost and shares_total - p_shares >= 1000;
  if not found then raise exception 'Yetersiz nakit'; end if;
  return true;
end;
$$;

-- Oyuncu başka şirketin hissesini alır (piyasadan) ya da satar (piyasaya).
create or replace function public.equity_trade(p_holder uuid, p_target uuid, p_shares int, p_total bigint, p_buy boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  have int;
  basis bigint;
begin
  if p_holder = p_target then raise exception 'Kendi hisse'; end if;
  perform 1 from public.companies where id = p_target for update;
  select shares, cost_basis into have, basis from public.player_holdings where holder = p_holder and target = p_target for update;
  if p_buy then
    if (select ipo_at from public.companies where id = p_target) is null then raise exception 'Halka açık değil'; end if;
    if public.equity_float(p_target) < p_shares then raise exception 'Piyasada yeterli hisse yok'; end if;
    update public.companies set cash = cash - p_total, version = version + 1 where id = p_holder and cash >= p_total;
    if not found then raise exception 'Yetersiz nakit'; end if;
    insert into public.player_holdings (holder, target, shares, cost_basis) values (p_holder, p_target, p_shares, p_total)
    on conflict (holder, target) do update set shares = player_holdings.shares + excluded.shares, cost_basis = player_holdings.cost_basis + excluded.cost_basis;
  else
    if coalesce(have, 0) < p_shares then raise exception 'Elinde bu kadar hisse yok'; end if;
    if have = p_shares then
      delete from public.player_holdings where holder = p_holder and target = p_target;
    else
      update public.player_holdings set shares = shares - p_shares, cost_basis = round(basis * (have - p_shares)::numeric / have)
       where holder = p_holder and target = p_target;
    end if;
    update public.companies set cash = cash + p_total, version = version + 1 where id = p_holder;
  end if;
  return true;
end;
$$;

-- ---- Gizli operasyonlar ----
create table if not exists public.ops_log (
  id bigserial primary key,
  attacker uuid not null references public.companies(id) on delete cascade,
  target uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  cost bigint not null,
  success boolean not null,
  caught boolean not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ops_log_attacker_idx on public.ops_log (attacker, created_at desc);
create index if not exists ops_log_target_idx on public.ops_log (target, created_at desc);
alter table public.ops_log enable row level security;

-- Kasadan para harca (yetmezse false)
create or replace function public.spend_cash(p_company uuid, p_amount bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.companies set cash = cash - p_amount, version = version + 1 where id = p_company and cash >= p_amount;
  return found;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'equity_issue(uuid, int, bigint)',
    'equity_buyback(uuid, int, bigint)',
    'equity_trade(uuid, uuid, int, bigint, boolean)',
    'spend_cash(uuid, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
