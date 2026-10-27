-- 015: Sırlar, dosyalar ve şantaj. 014'ten SONRA bir kez çalıştır.
--
-- secrets   : bir şirketin kamuoyunun bilmediği kirli işi (örtbas edilen kriz, yakalanmadan yürütülen operasyon).
-- dossiers  : bir şirketin elindeki, başka bir şirketin sırrına ait dosya.
-- blackmails: dosyayı tutanın sırrın sahibine gönderdiği isimsiz tehdit.
--
-- Para, hisse ve ihale hareketleri tek kilitli fonksiyonlarda yapılır (blackmail_send, blackmail_resolve):
-- aynı anda gönderilen istekler aynı dosyayı iki kez kullanamaz, aynı şantaj iki kez ödenemez.
-- Tablolara yalnızca sunucu (service role) erişir.

create table if not exists public.secrets (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  severity int not null check (severity between 1 and 3),
  summary text not null,
  headline text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  exposed_at timestamptz
);
create index if not exists secrets_company_idx on public.secrets (company_id, created_at desc);
alter table public.secrets enable row level security;

create table if not exists public.dossiers (
  id bigserial primary key,
  holder uuid not null references public.companies(id) on delete cascade,
  secret_id bigint not null references public.secrets(id) on delete cascade,
  obtained_at timestamptz not null default now(),
  -- active: kullanılabilir · pledged: açık bir şantajda · used: harcandı · burned: yandı (sır açığa çıktı ya da şantajcı yakalandı)
  status text not null default 'active' check (status in ('active', 'pledged', 'used', 'burned')),
  cooldown_until timestamptz,
  unique (holder, secret_id)
);
create index if not exists dossiers_holder_idx on public.dossiers (holder, status);
create index if not exists dossiers_secret_idx on public.dossiers (secret_id);
alter table public.dossiers enable row level security;

create table if not exists public.blackmails (
  id uuid primary key default gen_random_uuid(),
  blackmailer uuid not null references public.companies(id) on delete cascade,
  target uuid not null references public.companies(id) on delete cascade,
  dossier_id bigint references public.dossiers(id) on delete set null,
  secret_id bigint references public.secrets(id) on delete set null,
  severity int not null check (severity between 1 and 3),
  summary text not null,
  demand_kind text not null check (demand_kind in ('cash', 'shares', 'tender')),
  amount bigint not null default 0 check (amount >= 0),
  shares int not null default 0 check (shares >= 0),
  tender_id text,
  tender_label text,
  note text,
  fair bigint not null default 0,
  -- open → paid | refused | reported | countered | expired ; caught: gönderirken yakalandı
  status text not null default 'open' check (status in ('open', 'paid', 'refused', 'reported', 'countered', 'expired', 'caught')),
  caught boolean not null default false,
  revealed boolean not null default false, -- hedef şantajcının kim olduğunu biliyor
  counter_tried boolean not null default false,
  outcome jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  read_at timestamptz
);
create index if not exists blackmails_target_idx on public.blackmails (target, created_at desc);
create index if not exists blackmails_blackmailer_idx on public.blackmails (blackmailer, created_at desc);
create index if not exists blackmails_open_idx on public.blackmails (status, expires_at);
alter table public.blackmails enable row level security;

-- ---------------------------------------------------------------------------
-- Gönder. p_caught: sunucunun attığı yakalanma zarı. Yakalanırsa tehdit hiç ulaşmaz:
-- dosya yanar, ceza kesilir (kasa sıfırın altına inmez), kayıt 'caught' olarak düşer.
-- ---------------------------------------------------------------------------
create or replace function public.blackmail_send(
  p_blackmailer uuid, p_target uuid, p_dossier bigint,
  p_kind text, p_amount bigint, p_shares int, p_tender text, p_tender_label text, p_note text,
  p_fair bigint, p_answer_hours int, p_window_hours int, p_per_window int, p_protect_hours int, p_ban_hours int,
  p_caught boolean, p_fine bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.dossiers%rowtype;
  s public.secrets%rowtype;
  t public.companies%rowtype;
  rid uuid;
  fine bigint := 0;
begin
  if p_blackmailer = p_target then raise exception 'Kendi şirketi'; end if;
  -- Kilit sırası sabit (kilitlenme olmasın)
  perform 1 from public.companies where id in (p_blackmailer, p_target) order by id for update;
  select * into t from public.companies where id = p_target;
  if not found then raise exception 'Şirket yok'; end if;

  select * into d from public.dossiers where id = p_dossier for update;
  if not found or d.holder <> p_blackmailer then raise exception 'Dosya yok'; end if;
  if d.status <> 'active' or (d.cooldown_until is not null and d.cooldown_until > now()) then raise exception 'Dosya kullanılamaz'; end if;
  select * into s from public.secrets where id = d.secret_id;
  if s.company_id <> p_target then raise exception 'Dosya yok'; end if;
  if s.exposed_at is not null or s.expires_at <= now() then raise exception 'Dosya bayat'; end if;

  if t.created_at > now() - make_interval(hours => p_protect_hours) then raise exception 'Yeni şirket'; end if;
  if exists (select 1 from public.blackmails where blackmailer = p_blackmailer and caught and coalesce(resolved_at, created_at) > now() - make_interval(hours => p_ban_hours)) then
    raise exception 'Şantaj yasağı';
  end if;
  if (select count(*) from public.blackmails where blackmailer = p_blackmailer and created_at > now() - make_interval(hours => p_window_hours)) >= p_per_window then
    raise exception 'Şantaj sınırı';
  end if;
  if exists (select 1 from public.blackmails where target = p_target and status = 'open') then raise exception 'Hedef meşgul'; end if;

  if p_kind = 'cash' then
    if p_amount < 1 then raise exception 'Tutar geçersiz'; end if;
  elsif p_kind = 'shares' then
    if p_shares < 1 or t.founder_shares - p_shares < ceil(t.shares_total * 0.51) then raise exception 'Kontrol payı'; end if;
  elsif p_kind = 'tender' then
    if not exists (
      select 1 from public.tender_bids b join public.tenders tt on tt.id = b.tender_id
       where b.tender_id = p_tender and b.company_id = p_target and b.status = 'pending' and tt.status = 'open' and tt.closes_at > now()
    ) then raise exception 'İhale teklifi yok'; end if;
  else
    raise exception 'Talep geçersiz';
  end if;

  if p_caught then
    fine := least(p_fine, (select cash from public.companies where id = p_blackmailer));
    update public.companies set cash = cash - fine, version = version + 1 where id = p_blackmailer;
    update public.dossiers set status = 'burned' where id = d.id;
    insert into public.blackmails (blackmailer, target, dossier_id, secret_id, severity, summary, demand_kind, amount, shares, tender_id, tender_label, note, fair,
                                   status, caught, revealed, outcome, expires_at, resolved_at)
    values (p_blackmailer, p_target, d.id, s.id, s.severity, s.summary, p_kind, greatest(p_amount, 0), greatest(p_shares, 0), p_tender, p_tender_label, p_note, p_fair,
            'caught', true, true, jsonb_build_object('fine', fine), now(), now())
    returning id into rid;
    return jsonb_build_object('id', rid, 'caught', true, 'fine', fine);
  end if;

  update public.dossiers set status = 'pledged' where id = d.id;
  insert into public.blackmails (blackmailer, target, dossier_id, secret_id, severity, summary, demand_kind, amount, shares, tender_id, tender_label, note, fair, expires_at)
  values (p_blackmailer, p_target, d.id, s.id, s.severity, s.summary, p_kind, greatest(p_amount, 0), greatest(p_shares, 0), p_tender, p_tender_label, p_note, p_fair,
          now() + make_interval(hours => p_answer_hours))
  returning id into rid;
  return jsonb_build_object('id', rid, 'caught', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sonuçlandır. Yalnızca 'open' durumdaki tehdit bir kez sonuçlanır; ikinci çağrı null döner.
--   pay     : hedef öder (para / hisse / ihaleden çekilme). p_copy: şantajcının elinde kopya kalır mı.
--   refuse  : hedef reddeder, sır açığa çıkar.
--   report  : hedef ihbar eder, sır açığa çıkar (hafifletilmiş). p_caught: şantajcı yakalandı mı.
--   counter : hedef, şantajcıya ait bir dosyası varsa karşı tehdit eder; iki taraf geri çekilir.
--             Dosyası yoksa deneme boşa gider (bir kez), tehdit açık kalır.
--   expire  : süre doldu (sistem), ret gibi.
-- ---------------------------------------------------------------------------
create or replace function public.blackmail_resolve(
  p_id uuid, p_actor uuid, p_action text, p_copy boolean, p_caught boolean, p_fine bigint, p_cooldown_hours int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.blackmails%rowtype;
  t public.companies%rowtype;
  v_bond bigint;
  fine bigint := 0;
  mine bigint;
begin
  select * into b from public.blackmails where id = p_id for update;
  if not found then raise exception 'Tehdit yok'; end if;
  if b.status <> 'open' then return null; end if;
  if p_action = 'expire' then
    if b.expires_at > now() then return null; end if;
  else
    if p_actor is distinct from b.target then raise exception 'Tehdit yok'; end if;
    if b.expires_at <= now() then raise exception 'Süre doldu'; end if;
  end if;

  perform 1 from public.companies where id in (b.blackmailer, b.target) order by id for update;
  select * into t from public.companies where id = b.target;

  if p_action = 'pay' then
    if b.demand_kind = 'cash' then
      update public.companies set cash = cash - b.amount, version = version + 1 where id = b.target and cash >= b.amount;
      if not found then raise exception 'Yetersiz nakit'; end if;
      update public.companies set cash = cash + b.amount, version = version + 1 where id = b.blackmailer;
    elsif b.demand_kind = 'shares' then
      if t.founder_shares - b.shares < ceil(t.shares_total * 0.51) then raise exception 'Kontrol payı'; end if;
      update public.companies set founder_shares = founder_shares - b.shares, version = version + 1 where id = b.target;
      insert into public.player_holdings (holder, target, shares, cost_basis) values (b.blackmailer, b.target, b.shares, 0)
      on conflict (holder, target) do update set shares = player_holdings.shares + excluded.shares;
    elsif b.demand_kind = 'tender' then
      perform 1 from public.tenders where id = b.tender_id and status = 'open' and closes_at > now() for share;
      if not found then raise exception 'İhale kapandı'; end if;
      delete from public.tender_bids where tender_id = b.tender_id and company_id = b.target and status = 'pending' returning tender_bids.bond into v_bond;
      if v_bond is null then raise exception 'İhale teklifi yok'; end if;
      update public.companies set cash = cash + v_bond, version = version + 1 where id = b.target;
    end if;
    update public.blackmails set status = 'paid', resolved_at = now(), outcome = jsonb_build_object('copy', p_copy) where id = b.id;
    if p_copy then
      update public.dossiers set status = 'active', cooldown_until = now() + make_interval(hours => p_cooldown_hours) where id = b.dossier_id;
    else
      update public.dossiers set status = 'used' where id = b.dossier_id;
    end if;
    return jsonb_build_object('status', 'paid', 'copy', p_copy);

  elsif p_action in ('refuse', 'expire', 'report') then
    if p_action = 'report' and p_caught then
      fine := least(p_fine, (select cash from public.companies where id = b.blackmailer));
      update public.companies set cash = cash - fine, version = version + 1 where id = b.blackmailer;
    end if;
    -- Sır açığa çıktı: bu sırra ait bütün dosyalar değersiz
    update public.secrets set exposed_at = coalesce(exposed_at, now()) where id = b.secret_id;
    update public.dossiers set status = 'burned' where secret_id = b.secret_id;
    -- Aynı sır için başkalarının açık tehditleri de boşa düşer
    update public.blackmails set status = 'expired', resolved_at = now(), outcome = jsonb_build_object('void', true)
     where secret_id = b.secret_id and status = 'open' and id <> b.id;
    update public.blackmails
       set status = case p_action when 'refuse' then 'refused' when 'expire' then 'expired' else 'reported' end,
           caught = (p_action = 'report' and p_caught),
           revealed = (p_action = 'report' and p_caught),
           resolved_at = now(),
           outcome = jsonb_build_object('fine', fine)
     where id = b.id;
    return jsonb_build_object('status', p_action, 'caught', p_action = 'report' and p_caught, 'fine', fine, 'secret', b.secret_id);

  elsif p_action = 'counter' then
    if b.counter_tried then raise exception 'Zaten denendi'; end if;
    select d.id into mine
      from public.dossiers d join public.secrets s on s.id = d.secret_id
     where d.holder = b.target and d.status = 'active' and (d.cooldown_until is null or d.cooldown_until <= now())
       and s.company_id = b.blackmailer and s.exposed_at is null and s.expires_at > now()
     order by s.severity desc, s.created_at desc
     limit 1
     for update of d;
    if mine is null then
      update public.blackmails set counter_tried = true where id = b.id;
      return jsonb_build_object('status', 'open', 'countered', false);
    end if;
    update public.dossiers set status = 'used' where id = mine;
    update public.dossiers set status = 'burned' where id = b.dossier_id;
    update public.blackmails set status = 'countered', revealed = true, counter_tried = true, resolved_at = now(),
           outcome = jsonb_build_object('counterDossier', mine) where id = b.id;
    return jsonb_build_object('status', 'countered', 'countered', true);
  end if;
  raise exception 'Bilinmeyen işlem';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'blackmail_send(uuid, uuid, bigint, text, bigint, int, text, text, text, bigint, int, int, int, int, int, boolean, bigint)',
    'blackmail_resolve(uuid, uuid, text, boolean, boolean, bigint, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
