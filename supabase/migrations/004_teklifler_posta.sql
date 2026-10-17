-- 004: İş teklifleri / senaryolar ve şirketler arası posta. 003'ten SONRA bir kez çalıştır.

create table if not exists public.company_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template text not null,
  sender text not null,
  subject text not null,
  body text not null,
  choices jsonb not null,           -- seçenekler: maliyet, süre, başarı olasılığı, ödül/ceza
  status text not null default 'open' check (status in ('open', 'active', 'done', 'expired', 'declined')),
  choice_id text,
  resolves_at timestamptz,
  result_text text,
  result_amount bigint,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists company_offers_company_idx on public.company_offers (company_id, created_at desc);
create index if not exists company_offers_status_idx on public.company_offers (company_id, status);
alter table public.company_offers enable row level security;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_company uuid not null references public.companies(id) on delete cascade,
  to_company uuid not null references public.companies(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (from_company <> to_company)
);
create index if not exists messages_to_idx on public.messages (to_company, created_at desc);
create index if not exists messages_from_idx on public.messages (from_company, created_at desc);
alter table public.messages enable row level security;

-- Teklifi kabul et: açık ve süresi dolmamışsa etkinleştirir, ön maliyeti (varsa) nakitten düşer.
-- Nakit yetmezse 'Yetersiz nakit' hatası verir ve hiçbir şey değişmez.
create or replace function public.accept_offer(
  p_offer uuid,
  p_company uuid,
  p_choice text,
  p_cost bigint,
  p_resolves_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.company_offers
     set status = 'active', choice_id = p_choice, resolves_at = p_resolves_at, read_at = coalesce(read_at, now())
   where id = p_offer and company_id = p_company and status = 'open' and expires_at > now();
  if not found then
    return false;
  end if;

  if p_cost > 0 then
    update public.companies
       set cash = cash - p_cost, version = version + 1
     where id = p_company and cash >= p_cost;
    if not found then
      raise exception 'Yetersiz nakit';
    end if;
  end if;
  return true;
end;
$$;

-- Teklifi sonuçlandır: yalnızca bir kez çalışır (open/active → done/expired/declined), nakdi değiştirir.
create or replace function public.settle_offer(
  p_offer uuid,
  p_status text,
  p_amount bigint,
  p_text text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  update public.company_offers
     set status = p_status, result_amount = p_amount, result_text = p_text, read_at = null
   where id = p_offer and status in ('open', 'active')
  returning company_id into cid;
  if cid is null then
    return false;
  end if;

  if p_amount <> 0 then
    update public.companies
       set cash = greatest(0, cash + p_amount), version = version + 1
     where id = cid;
  end if;
  return true;
end;
$$;

revoke all on function public.accept_offer(uuid, uuid, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.settle_offer(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.accept_offer(uuid, uuid, text, bigint, timestamptz) to service_role;
grant execute on function public.settle_offer(uuid, text, bigint, text) to service_role;
