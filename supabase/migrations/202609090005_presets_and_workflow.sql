-- Удержание всегда имеет дату события: без неё запись выпадала из выборок по месяцу.
update public.wb_deductions set event_at = created_at where event_at is null;
alter table public.wb_deductions alter column event_at set default now();
alter table public.wb_deductions alter column event_at set not null;

-- Запомненные суммы доходов и расходов для каждого пункта выдачи.
create table if not exists public.entry_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  pickup_point_id uuid not null references public.pickup_points on delete cascade,
  kind text not null check(kind in ('INCOME','EXPENSE')),
  category_name text not null check(length(trim(category_name)) > 0),
  amount_kopecks bigint not null check(amount_kopecks > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organization_id, pickup_point_id, kind, category_name)
);
create index if not exists entry_presets_point_idx on public.entry_presets(pickup_point_id, kind);

-- Ставка по умолчанию для пункта: подставляется при добавлении сотрудника.
create table if not exists public.point_salary_defaults (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  pickup_point_id uuid not null references public.pickup_points on delete cascade,
  payment_type public.payment_type not null,
  rate_kopecks bigint not null check(rate_kopecks >= 0),
  monthly_norm_days integer not null default 22 check(monthly_norm_days > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organization_id, pickup_point_id, payment_type)
);

do $$ declare t text; begin
  foreach t in array array['entry_presets','point_salary_defaults'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists org_select on public.%I', t);
    execute format('drop policy if exists org_write on public.%I', t);
    execute format('create policy org_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy org_write on public.%I for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))', t);
  end loop;
end $$;

-- Запоминание суммы: создаёт пресет или перезаписывает существующий.
create or replace function public.upsert_entry_preset(
  p_pickup_point_id uuid, p_kind text, p_category text, p_amount bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_organization uuid;
  preset_id uuid;
begin
  select organization_id into target_organization from public.pickup_points where id = p_pickup_point_id;
  if target_organization is null then raise exception 'pickup point not found'; end if;
  if not public.is_org_owner(target_organization) then raise exception 'forbidden'; end if;
  if p_kind not in ('INCOME','EXPENSE') then raise exception 'unknown preset kind'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if length(trim(coalesce(p_category, ''))) = 0 then raise exception 'category is required'; end if;

  insert into public.entry_presets(organization_id, pickup_point_id, kind, category_name, amount_kopecks)
  values (target_organization, p_pickup_point_id, p_kind, trim(p_category), p_amount)
  on conflict (organization_id, pickup_point_id, kind, category_name)
  do update set amount_kopecks = excluded.amount_kopecks, updated_at = now()
  returning id into preset_id;
  return preset_id;
end $$;
revoke all on function public.upsert_entry_preset(uuid, text, text, bigint) from public;
grant execute on function public.upsert_entry_preset(uuid, text, text, bigint) to authenticated;

-- Запоминание ставки пункта.
create or replace function public.upsert_point_salary_default(
  p_pickup_point_id uuid, p_payment_type public.payment_type, p_rate bigint, p_norm_days integer default 22
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_organization uuid;
  default_id uuid;
begin
  select organization_id into target_organization from public.pickup_points where id = p_pickup_point_id;
  if target_organization is null then raise exception 'pickup point not found'; end if;
  if not public.is_org_owner(target_organization) then raise exception 'forbidden'; end if;
  if p_rate is null or p_rate < 0 then raise exception 'rate must not be negative'; end if;

  insert into public.point_salary_defaults(organization_id, pickup_point_id, payment_type, rate_kopecks, monthly_norm_days)
  values (target_organization, p_pickup_point_id, p_payment_type, p_rate, coalesce(p_norm_days, 22))
  on conflict (organization_id, pickup_point_id, payment_type)
  do update set rate_kopecks = excluded.rate_kopecks, monthly_norm_days = excluded.monthly_norm_days, updated_at = now()
  returning id into default_id;
  return default_id;
end $$;
revoke all on function public.upsert_point_salary_default(uuid, public.payment_type, bigint, integer) from public;
grant execute on function public.upsert_point_salary_default(uuid, public.payment_type, bigint, integer) to authenticated;
