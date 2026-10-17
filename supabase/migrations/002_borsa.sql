-- 002: Borsa (hisse al-sat). schema.sql'den SONRA, Supabase SQL Editor'de bir kez çalıştır.

create table if not exists public.company_holdings (
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_id text not null,
  shares bigint not null default 0 check (shares >= 0),
  cost_basis bigint not null default 0 check (cost_basis >= 0), -- komisyon dahil toplam maliyet
  primary key (company_id, stock_id)
);

create table if not exists public.trades (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_id text not null,
  side text not null check (side in ('buy', 'sell')),
  shares bigint not null check (shares > 0),
  price numeric(14, 2) not null,
  total bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists trades_company_created_idx on public.trades (company_id, created_at desc);

alter table public.company_holdings enable row level security;
alter table public.trades enable row level security;

-- Atomik işlem: nakit + toplama zamanı + pozisyon + işlem kaydı tek seferde.
create or replace function public.apply_trade(
  p_company uuid,
  p_version int,
  p_new_cash bigint,
  p_stock text,
  p_new_shares bigint,
  p_new_cost_basis bigint,
  p_side text,
  p_shares bigint,
  p_price numeric,
  p_total bigint
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

  if p_new_shares = 0 then
    delete from public.company_holdings where company_id = p_company and stock_id = p_stock;
  else
    insert into public.company_holdings (company_id, stock_id, shares, cost_basis)
    values (p_company, p_stock, p_new_shares, p_new_cost_basis)
    on conflict (company_id, stock_id)
    do update set shares = excluded.shares, cost_basis = excluded.cost_basis;
  end if;

  insert into public.trades (company_id, stock_id, side, shares, price, total)
  values (p_company, p_stock, p_side, p_shares, p_price, p_total);

  return true;
end;
$$;

revoke all on function public.apply_trade(uuid, int, bigint, text, bigint, bigint, text, bigint, numeric, bigint) from public, anon, authenticated;
grant execute on function public.apply_trade(uuid, int, bigint, text, bigint, bigint, text, bigint, numeric, bigint) to service_role;
