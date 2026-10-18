-- 013: Banka işlemleri tek kilitli fonksiyonda. 012'den SONRA bir kez çalıştır.
--
-- Hata: bank_apply hesabın tamamını istemcinin eski kopyasından yeniden yazıyordu. Aynı anda gönderilen
-- istekler hepsi "kredi yok" görüp kasaya para ekliyor, kayda tek kredi düşüyordu (paralel çekim de aynı).
-- Ayrıca vadede yalnızca kasaya bakılıyor, mevduattaki para haczedilmiyor ve kalan borç siliniyordu.
--
-- Düzeltme: bank_op hesabı ve şirketi kilitler, faizi ve sınırları kilit altında hesaplar.
-- Vadede önce kasa, sonra mevduat tahsil edilir (ceza yok). Yine de ödenemeyen kısım silinmez: ertesi güne
-- vadeli borç olarak kalır (net değerden düşer), banka 24 saat yeni kredi vermez, itibar düşer.

create or replace function public.bank_op(
  p_company uuid, p_action text, p_amount bigint, p_days int,
  p_loan_rate double precision, p_deposit_rate double precision, p_limit bigint, p_ban_hours int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_cash bigint;
  b public.bank_accounts%rowtype;
  t timestamptz := now();
  dep bigint;
  owed bigint := 0;
  paid bigint;
  from_dep bigint;
  rest bigint;
begin
  select cash into c_cash from public.companies where id = p_company for update;
  if not found then raise exception 'Şirket yok'; end if;
  insert into public.bank_accounts (company_id) values (p_company) on conflict (company_id) do nothing;
  select * into b from public.bank_accounts where company_id = p_company for update;

  dep := floor(b.deposit * (1 + p_deposit_rate * greatest(0, extract(epoch from (t - b.deposit_at))) / 86400.0));
  if b.loan_principal > 0 then
    owed := ceil(b.loan_principal * (1 + b.loan_rate * greatest(0, extract(epoch from (least(t, b.loan_due_at) - b.loan_taken_at))) / 86400.0));
  end if;

  if p_action = 'borrow' then
    if b.loan_principal > 0 then raise exception 'Açık kredi var'; end if;
    if b.banned_until is not null and b.banned_until > t then raise exception 'Kredi yasağı'; end if;
    if p_days not in (1, 2, 3) then raise exception 'Vade geçersiz'; end if;
    if p_amount < 100 or p_amount > p_limit then raise exception 'Tutar sınır dışı'; end if;
    update public.bank_accounts
       set loan_principal = p_amount, loan_rate = p_loan_rate, loan_taken_at = t, loan_due_at = t + make_interval(days => p_days)
     where company_id = p_company;
    update public.companies set cash = cash + p_amount, version = version + 1 where id = p_company;
    return jsonb_build_object('amount', p_amount, 'due', ceil(p_amount * (1 + p_loan_rate * p_days)));

  elsif p_action = 'repay' then
    if b.loan_principal <= 0 then raise exception 'Açık kredi yok'; end if;
    if c_cash < owed then raise exception 'Yetersiz nakit'; end if;
    update public.bank_accounts set loan_principal = 0, loan_rate = 0, loan_taken_at = null, loan_due_at = null where company_id = p_company;
    update public.companies set cash = cash - owed, version = version + 1 where id = p_company;
    return jsonb_build_object('owed', owed);

  elsif p_action = 'deposit' then
    if p_amount < 1 then raise exception 'Tutar geçersiz'; end if;
    if c_cash < p_amount then raise exception 'Yetersiz nakit'; end if;
    update public.bank_accounts set deposit = dep + p_amount, deposit_at = t where company_id = p_company;
    update public.companies set cash = cash - p_amount, version = version + 1 where id = p_company;
    return jsonb_build_object('deposit', dep + p_amount);

  elsif p_action = 'withdraw' then
    if p_amount < 1 or p_amount > dep then raise exception 'Mevduat yetersiz'; end if;
    update public.bank_accounts set deposit = dep - p_amount, deposit_at = t where company_id = p_company;
    update public.companies set cash = cash + p_amount, version = version + 1 where id = p_company;
    return jsonb_build_object('deposit', dep - p_amount);

  elsif p_action = 'mature' then
    if b.loan_principal <= 0 or b.loan_due_at > t then return null; end if;
    paid := least(c_cash, owed);
    from_dep := least(dep, owed - paid);
    rest := owed - paid - from_dep;
    update public.companies set cash = cash - paid, version = version + 1 where id = p_company;
    if rest > 0 then
      -- Ödenemeyen kısım silinmez: ertesi güne vadeli borç olarak kalır
      update public.bank_accounts
         set deposit = dep - from_dep, deposit_at = t, loan_principal = rest, loan_taken_at = t,
             loan_due_at = t + interval '1 day', banned_until = t + make_interval(hours => p_ban_hours)
       where company_id = p_company;
    else
      update public.bank_accounts
         set deposit = dep - from_dep, deposit_at = t, loan_principal = 0, loan_rate = 0, loan_taken_at = null, loan_due_at = null,
             banned_until = banned_until
       where company_id = p_company;
    end if;
    return jsonb_build_object('owed', owed, 'paid', paid, 'fromDeposit', from_dep, 'rest', rest);
  end if;
  raise exception 'Bilinmeyen işlem';
end;
$$;

revoke all on function public.bank_op(uuid, text, bigint, int, double precision, double precision, bigint, int) from public, anon, authenticated;
grant execute on function public.bank_op(uuid, text, bigint, int, double precision, double precision, bigint, int) to service_role;

-- Eski fonksiyon artık kullanılmıyor; istemciden değil sunucudan çağrılsa da kapatıyoruz.
revoke all on function public.bank_apply(uuid, bigint, bigint, timestamptz, bigint, double precision, timestamptz, timestamptz, timestamptz) from service_role;

-- ---- Gizli operasyonlar: limitler de kilit altında ----
-- Hata: sınır kontrolü para çekilmeden önce yapılıyordu; aynı anda gönderilen istekler sınırı aşabiliyordu.
alter table public.ops_log add column if not exists settled boolean not null default true;

create or replace function public.ops_reserve(
  p_attacker uuid, p_target uuid, p_kind text, p_cost bigint, p_hours int, p_per_window int, p_hits int
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(hours => p_hours);
  rid bigint;
begin
  if p_attacker = p_target then raise exception 'Kendi şirketi'; end if;
  -- Kilit sırası sabit (kilitlenme olmasın)
  perform 1 from public.companies where id in (p_attacker, p_target) order by id for update;
  if (select count(*) from public.ops_log where attacker = p_attacker and created_at >= since) >= p_per_window then raise exception 'Operasyon sınırı'; end if;
  if exists (select 1 from public.ops_log where attacker = p_attacker and target = p_target and created_at >= since) then raise exception 'Aynı hedef'; end if;
  if (select count(*) from public.ops_log where target = p_target and created_at >= since and (success or not settled)) >= p_hits then raise exception 'Hedef tetikte'; end if;
  update public.companies set cash = cash - p_cost, version = version + 1 where id = p_attacker and cash >= p_cost;
  if not found then raise exception 'Yetersiz nakit'; end if;
  insert into public.ops_log (attacker, target, kind, cost, success, caught, settled) values (p_attacker, p_target, p_kind, p_cost, false, false, false)
  returning id into rid;
  return rid;
end;
$$;

revoke all on function public.ops_reserve(uuid, uuid, text, bigint, int, int, int) from public, anon, authenticated;
grant execute on function public.ops_reserve(uuid, uuid, text, bigint, int, int, int) to service_role;
