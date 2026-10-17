-- 006: Sezonlar ve şeref listesi. 005'ten SONRA bir kez çalıştır.

create table if not exists public.seasons (
  id serial primary key,
  number int not null unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  champions jsonb not null default '[]'::jsonb
);
alter table public.seasons enable row level security;

insert into public.seasons (number) select 1 where not exists (select 1 from public.seasons);

-- Sezonu bitirir: şampiyonları kaydeder, oyun verisini sıfırlar (hesaplar ve yöneticiler kalır),
-- yeni sezonu açar. Tek işlemde çalışır; yarıda kalırsa hiçbir şey silinmez.
create or replace function public.end_season(p_champions jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select number into n from public.seasons where ended_at is null order by number desc limit 1 for update;
  if n is null then
    raise exception 'Açık sezon yok';
  end if;
  update public.seasons set ended_at = now(), champions = coalesce(p_champions, '[]'::jsonb) where number = n;

  delete from public.social_posts where true;
  delete from public.companies where true; -- bağlı tüm oyun verisi cascade ile silinir
  delete from public.asset_generations where true;

  insert into public.seasons (number) values (n + 1);
  return n + 1;
end;
$$;

revoke all on function public.end_season(jsonb) from public, anon, authenticated;
grant execute on function public.end_season(jsonb) to service_role;
