-- 007: Çalışanlar, banka, statü eşyaları ve oyuncular arası anlaşmalar. 006'dan SONRA bir kez çalıştır.

create table if not exists public.employees (
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('muhasebeci', 'sekreter', 'satis', 'pr')),
  hired_at timestamptz not null default now(),
  paid_until timestamptz not null default now(),
  primary key (company_id, role)
);
alter table public.employees enable row level security;

create table if not exists public.bank_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  deposit bigint not null default 0 check (deposit >= 0),
  deposit_at timestamptz not null default now(),      -- faiz bu andan itibaren işler
  loan_principal bigint not null default 0 check (loan_principal >= 0),
  loan_rate double precision not null default 0,      -- günlük basit faiz
  loan_taken_at timestamptz,
  loan_due_at timestamptz,
  banned_until timestamptz                             -- temerrütten sonra kredi yasağı
);
alter table public.bank_accounts enable row level security;

create table if not exists public.status_items (
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id text not null,
  price bigint not null,
  bought_at timestamptz not null default now(),
  primary key (company_id, item_id)
);
alter table public.status_items enable row level security;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('wholesale', 'loan', 'revshare')),
  from_company uuid not null references public.companies(id) on delete cascade,
  to_company uuid not null references public.companies(id) on delete cascade,
  terms jsonb not null,
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'defaulted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  ends_at timestamptz,
  settled_at timestamptz,
  result text,
  check (from_company <> to_company)
);
create index if not exists deals_from_idx on public.deals (from_company, created_at desc);
create index if not exists deals_to_idx on public.deals (to_company, created_at desc);
alter table public.deals enable row level security;

-- Nakit transferi. p_partial: yetmezse eldekinin tamamını aktar. Aktarılan tutarı döndürür.
create or replace function public.transfer_cash(p_from uuid, p_to uuid, p_amount bigint, p_partial boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  have bigint;
  moved bigint;
begin
  if p_amount <= 0 then return 0; end if;
  select cash into have from public.companies where id = p_from for update;
  if have is null then raise exception 'Şirket bulunamadı'; end if;
  if have < p_amount and not p_partial then raise exception 'Yetersiz nakit'; end if;
  moved := least(have, p_amount);
  if moved > 0 then
    update public.companies set cash = cash - moved, version = version + 1 where id = p_from;
    update public.companies set cash = cash + moved, version = version + 1 where id = p_to;
  end if;
  return moved;
end;
$$;

-- Banka işlemi: hesabı yazar ve nakdi değiştirir; nakit eksiye düşecekse hiçbir şey değişmez.
create or replace function public.bank_apply(
  p_company uuid, p_cash_delta bigint, p_deposit bigint, p_deposit_at timestamptz,
  p_loan_principal bigint, p_loan_rate double precision, p_loan_taken_at timestamptz, p_loan_due_at timestamptz, p_banned_until timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.companies set cash = cash + p_cash_delta, version = version + 1
   where id = p_company and cash + p_cash_delta >= 0;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.bank_accounts (company_id, deposit, deposit_at, loan_principal, loan_rate, loan_taken_at, loan_due_at, banned_until)
  values (p_company, p_deposit, p_deposit_at, p_loan_principal, p_loan_rate, p_loan_taken_at, p_loan_due_at, p_banned_until)
  on conflict (company_id) do update set
    deposit = excluded.deposit, deposit_at = excluded.deposit_at, loan_principal = excluded.loan_principal,
    loan_rate = excluded.loan_rate, loan_taken_at = excluded.loan_taken_at, loan_due_at = excluded.loan_due_at,
    banned_until = excluded.banned_until;
  return true;
end;
$$;

-- Maaş ödemesi: yetiyorsa öder; yetmezse eldekini öder ve çalışanlar istifa eder. true: herkes kaldı.
create or replace function public.pay_payroll(p_company uuid, p_amount bigint, p_until timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  have bigint;
begin
  select cash into have from public.companies where id = p_company for update;
  if have >= p_amount then
    update public.companies set cash = cash - p_amount, version = version + 1 where id = p_company;
    update public.employees set paid_until = p_until where company_id = p_company;
    return true;
  end if;
  update public.companies set cash = 0, version = version + 1 where id = p_company;
  delete from public.employees where company_id = p_company;
  return false;
end;
$$;

-- Statü eşyası al / sat
create or replace function public.status_buy(p_company uuid, p_item text, p_price bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.companies set cash = cash - p_price, version = version + 1 where id = p_company and cash >= p_price;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.status_items (company_id, item_id, price) values (p_company, p_item, p_price);
  return true;
end;
$$;

create or replace function public.status_sell(p_company uuid, p_item text, p_refund bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.status_items where company_id = p_company and item_id = p_item;
  if not found then return false; end if;
  update public.companies set cash = cash + p_refund, version = version + 1 where id = p_company;
  return true;
end;
$$;

-- Anlaşmayı kabul et (borç / gelir ortaklığı): parayı ödeyen taraftan alana aktarır, anlaşmayı başlatır.
create or replace function public.deal_accept_transfer(p_deal uuid, p_payer uuid, p_payee uuid, p_amount bigint, p_ends_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.deals set status = 'active', accepted_at = now(), ends_at = p_ends_at
   where id = p_deal and status = 'pending' and expires_at > now();
  if not found then return false; end if;
  perform public.transfer_cash(p_payer, p_payee, p_amount, false);
  return true;
end;
$$;

-- Toptan satış: alıcı öder, satıcının stoğu düşer, alıcının bayi modeline eklenir.
create or replace function public.deal_accept_wholesale(
  p_deal uuid, p_buyer uuid, p_seller uuid, p_model uuid, p_qty int, p_total bigint, p_clone_name text, p_parts jsonb, p_clone_price bigint
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  clone uuid;
begin
  update public.deals set status = 'completed', accepted_at = now(), settled_at = now()
   where id = p_deal and status = 'pending' and expires_at > now();
  if not found then return false; end if;

  update public.pc_models set stock = stock - p_qty where id = p_model and company_id = p_seller and stock >= p_qty;
  if not found then raise exception 'Satıcının stoğu yetersiz'; end if;
  perform public.transfer_cash(p_buyer, p_seller, p_total, false);

  select id into clone from public.pc_models where company_id = p_buyer and name = p_clone_name for update;
  if clone is null then
    if (select count(*) from public.pc_models where company_id = p_buyer) >= 5 then
      raise exception 'Alıcının model sınırı dolu';
    end if;
    insert into public.pc_models (company_id, name, parts, price, stock, listed)
    values (p_buyer, p_clone_name, p_parts, p_clone_price, p_qty, false);
  else
    update public.pc_models set stock = stock + p_qty where id = clone and stock + p_qty <= 500;
    if not found then raise exception 'Alıcının deposu dolu'; end if;
  end if;
  return true;
end;
$$;

-- Vadesi gelen borç: borçludan alacaklıya, yetmezse eldeki kadar. Anlaşmayı kapatır.
create or replace function public.deal_settle_loan(p_deal uuid, p_borrower uuid, p_lender uuid, p_owed bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  moved bigint;
begin
  update public.deals set settled_at = now() where id = p_deal and status = 'active' and settled_at is null;
  if not found then return -1; end if;
  moved := public.transfer_cash(p_borrower, p_lender, p_owed, true);
  update public.deals set status = case when moved >= p_owed then 'completed' else 'defaulted' end,
         result = case when moved >= p_owed then 'Borç ödendi' else 'Borcun bir kısmı ödenemedi' end
   where id = p_deal;
  return moved;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'transfer_cash(uuid, uuid, bigint, boolean)',
    'bank_apply(uuid, bigint, bigint, timestamptz, bigint, double precision, timestamptz, timestamptz, timestamptz)',
    'pay_payroll(uuid, bigint, timestamptz)',
    'status_buy(uuid, text, bigint)',
    'status_sell(uuid, text, bigint)',
    'deal_accept_transfer(uuid, uuid, uuid, bigint, timestamptz)',
    'deal_accept_wholesale(uuid, uuid, uuid, uuid, int, bigint, text, jsonb, bigint)',
    'deal_settle_loan(uuid, uuid, uuid, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
