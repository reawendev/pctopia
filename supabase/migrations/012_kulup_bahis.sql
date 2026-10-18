-- 012: Kulüp (masa oyunları), piyasa bahsi ve bahis bürosu. 011'den SONRA bir kez çalıştır.
-- Hepsi oyun parasıyla; gerçek parayla hiçbir bağlantısı yoktur.

-- Bütün kumar hareketleri (kayıp haberleri ve geçmiş için)
create table if not exists public.casino_log (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  game text not null,
  bet bigint not null,
  payout bigint not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists casino_log_company_idx on public.casino_log (company_id, created_at desc);
alter table public.casino_log enable row level security;

-- Süren blackjack eli (şirket başına bir tane; deste sunucuda gizli)
create table if not exists public.blackjack_hands (
  company_id uuid primary key references public.companies(id) on delete cascade,
  bet bigint not null,
  deck jsonb not null,
  player jsonb not null,
  dealer jsonb not null,
  doubled boolean not null default false,
  step int not null default 0,              -- iyimser kilit: her hamlede artar
  created_at timestamptz not null default now()
);
alter table public.blackjack_hands enable row level security;

-- Piyasa bahsi: hisse belirli sürede yukarıda mı aşağıda mı
create table if not exists public.market_bets (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_id text not null,
  dir text not null check (dir in ('up', 'down')),
  bet bigint not null check (bet > 0),
  odds double precision not null,
  start_price double precision not null,
  settle_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'push')),
  end_price double precision,
  payout bigint,
  created_at timestamptz not null default now()
);
create index if not exists market_bets_open_idx on public.market_bets (status, settle_at);
create index if not exists market_bets_company_idx on public.market_bets (company_id, created_at desc);
alter table public.market_bets enable row level security;

-- Bahis bürosu: ortak havuzlu bahisler (kazananlar havuzu paylaşır, büro %5 alır)
create table if not exists public.bet_pools (
  id text primary key,                       -- 'leader:2026-10-19', 'tender:12'
  kind text not null check (kind in ('leader', 'tender')),
  title text not null,
  ref text,                                  -- tender id
  closes_at timestamptz not null,
  resolves_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'settled')),
  winner text,
  settled_at timestamptz
);
create index if not exists bet_pools_status_idx on public.bet_pools (status, resolves_at);
alter table public.bet_pools enable row level security;

create table if not exists public.pool_bets (
  id bigserial primary key,
  pool_id text not null references public.bet_pools(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  option text not null,                      -- şirket kimliği ya da 'rival'
  amount bigint not null check (amount > 0),
  payout bigint,
  created_at timestamptz not null default now()
);
create index if not exists pool_bets_pool_idx on public.pool_bets (pool_id);
create index if not exists pool_bets_company_idx on public.pool_bets (company_id, created_at desc);
alter table public.pool_bets enable row level security;

-- Masa oyunu: bahsi al, kazancı öde (tek işlem). Kasa yetmezse hata.
create or replace function public.casino_apply(p_company uuid, p_bet bigint, p_payout bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.companies set cash = cash - p_bet + p_payout, version = version + 1 where id = p_company and cash >= p_bet;
  if not found then raise exception 'Yetersiz nakit'; end if;
  return true;
end;
$$;

-- Havuza bahis
create or replace function public.pool_bet(p_pool text, p_company uuid, p_option text, p_amount bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.bet_pools where id = p_pool and status = 'open' and closes_at > now() for share;
  if not found then raise exception 'Bahis kapandı'; end if;
  update public.companies set cash = cash - p_amount, version = version + 1 where id = p_company and cash >= p_amount;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.pool_bets (pool_id, company_id, option, amount) values (p_pool, p_company, p_option, p_amount);
  return true;
end;
$$;

-- Havuzu sonuçlandır: kazananlara (toplam × 0,95) oranında paylaştır; kazanan yoksa herkese iade.
create or replace function public.pool_settle(p_pool text, p_winner text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  total bigint;
  winners bigint;
  b record;
  pay bigint;
begin
  perform 1 from public.bet_pools where id = p_pool and status = 'open' for update;
  if not found then return null; end if;
  select coalesce(sum(amount), 0) into total from public.pool_bets where pool_id = p_pool;
  select coalesce(sum(amount), 0) into winners from public.pool_bets where pool_id = p_pool and option = p_winner;
  for b in select * from public.pool_bets where pool_id = p_pool loop
    if winners = 0 then
      pay := b.amount; -- kimse bilemedi: iade
    elsif b.option = p_winner then
      pay := floor(b.amount::numeric * total * 0.95 / winners);
    else
      pay := 0;
    end if;
    update public.pool_bets set payout = pay where id = b.id;
    if pay > 0 then update public.companies set cash = cash + pay, version = version + 1 where id = b.company_id; end if;
  end loop;
  update public.bet_pools set status = 'settled', winner = p_winner, settled_at = now() where id = p_pool;
  return jsonb_build_object('total', total, 'winners', winners);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'casino_apply(uuid, bigint, bigint)',
    'pool_bet(text, uuid, text, bigint)',
    'pool_settle(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
