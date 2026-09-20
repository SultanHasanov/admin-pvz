-- ============================================================================
-- «Пункт»: вся схема базы одним файлом — миграции 202609090001_ini … 202609090023_gro по порядку.
-- Собрано 2026-09-20 из supabase/migrations/ (23 файлов). Источник правды —
-- по-прежнему папка migrations: правите там, этот файл пересобираете.
--
-- Для ПУСТОЙ базы Supabase (SQL Editor → вставить → Run). Всё в одной транзакции:
-- ошибка на любом шаге откатывает всё, база остаётся как была.
--
-- Снести текущую базу перед применением (выполнить ОТДЕЛЬНО, необратимо):
--
--   drop schema if exists public cascade;
--   create schema public;
--   grant usage on schema public to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
--
-- Аккаунты (auth.users) это не трогает: люди смогут войти, но организаций у них не будет —
-- приложение отправит их на регистрацию. Удалить и аккаунты: Authentication → Users.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090001_initial_schema.sql
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create type public.member_role as enum ('OWNER','MANAGER','EMPLOYEE');
create type public.module_key as enum ('employees','shifts','salary','income','expenses','taxes','penalties','wb_deductions','telegram','analytics','valuable_items');
create type public.shift_status as enum ('PLANNED','ON_DUTY','COMPLETED','REPLACED','NO_SHOW');
create type public.payment_type as enum ('SHIFT','HOURLY','SALARY');
create type public.penalty_status as enum ('ASSIGNED','DISPUTED','CANCELLED','CONFIRMED','WITHHELD');
create type public.deduction_status as enum ('NEW','INVESTIGATING','DISPUTED','PENDING','CANCELLED_BY_WB','CONFIRMED_BY_WB','EMPLOYEE_LIABILITY','OWNER_LOSS');

create table public.profiles (id uuid primary key references auth.users on delete cascade, full_name text, onboarding_completed boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null check(length(name)>1), currency text not null default 'RUB', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, user_id uuid references auth.users on delete cascade, employee_id uuid, role public.member_role not null, permissions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(organization_id,user_id));
create table public.pickup_points (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, internal_name text, address text not null, timezone text not null default 'Europe/Moscow', working_hours jsonb not null default '{}'::jsonb, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.employees (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, full_name text not null, phone text, telegram_username text, payment_type public.payment_type not null default 'SHIFT', status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.organization_members add constraint member_employee_fk foreign key(employee_id) references public.employees on delete set null;
create table public.employee_pickup_points (employee_id uuid not null references public.employees on delete cascade, pickup_point_id uuid not null references public.pickup_points on delete cascade, created_at timestamptz not null default now(), primary key(employee_id,pickup_point_id));
create table public.salary_rules (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees on delete cascade, payment_type public.payment_type not null, rate_kopecks bigint not null check(rate_kopecks>=0), effective_from date not null, monthly_norm_days integer check(monthly_norm_days > 0), created_at timestamptz not null default now(), unique(employee_id,effective_from));
create table public.shifts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid not null references public.pickup_points, employee_id uuid not null references public.employees, planned_start timestamptz not null, planned_end timestamptz not null, actual_start timestamptz, actual_end timestamptz, status public.shift_status not null default 'PLANNED', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(planned_end > planned_start), check(actual_end is null or actual_start is null or actual_end > actual_start));
create index shifts_org_period_idx on public.shifts(organization_id, planned_start);
create table public.shift_changes (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, shift_id uuid not null references public.shifts on delete cascade, previous_employee_id uuid references public.employees, new_employee_id uuid references public.employees, reason text, changed_by uuid references auth.users, created_at timestamptz not null default now());
create table public.shift_templates (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees, pickup_point_id uuid not null references public.pickup_points, pattern jsonb not null, starts_at time not null, ends_at time not null, active boolean not null default true, created_at timestamptz not null default now());
create table public.bonuses (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees, date date not null, amount_kopecks bigint not null check(amount_kopecks>0), comment text, created_at timestamptz not null default now());
create table public.employee_penalties (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees, pickup_point_id uuid references public.pickup_points, date date not null, amount_kopecks bigint not null check(amount_kopecks>0), reason text not null, comment text, status public.penalty_status not null default 'ASSIGNED', created_by uuid references auth.users, created_at timestamptz not null default now());
create table public.salary_periods (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, starts_on date not null, ends_on date not null, status text not null default 'OPEN' check(status in ('OPEN','CLOSED')), closed_at timestamptz, unique(organization_id,starts_on,ends_on), check(ends_on>=starts_on));
create table public.salary_accruals (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, salary_period_id uuid not null references public.salary_periods, employee_id uuid not null references public.employees, amount_kopecks bigint not null, calculation jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(salary_period_id,employee_id));
create table public.salary_payments (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees, date date not null, amount_kopecks bigint not null check(amount_kopecks>0), kind text not null check(kind in ('ADVANCE','PAYMENT','ADJUSTMENT')), comment text, created_at timestamptz not null default now());
create table public.income_entries (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid not null references public.pickup_points, date date not null, category text not null, amount_kopecks bigint not null check(amount_kopecks>0), description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.expense_categories (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, color text, archived_at timestamptz, unique(organization_id,name));
create table public.expense_entries (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid references public.pickup_points, category_id uuid references public.expense_categories, date date not null, amount_kopecks bigint not null check(amount_kopecks>0), description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.recurring_expenses (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid references public.pickup_points, category_id uuid references public.expense_categories, amount_kopecks bigint not null check(amount_kopecks>0), frequency text not null check(frequency in ('MONTHLY')), day_of_month integer not null check(day_of_month between 1 and 31), description text, active boolean not null default true, created_at timestamptz not null default now());
create table public.tax_settings (id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations on delete cascade, rate numeric(5,2) not null default 0 check(rate between 0 and 100), enabled boolean not null default false, updated_at timestamptz not null default now());
create table public.wb_deductions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid references public.pickup_points, event_at timestamptz, amount_kopecks bigint not null check(amount_kopecks>0), reason text not null, status public.deduction_status not null default 'NEW', shift_id uuid references public.shifts, employee_id uuid references public.employees, comment text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.wb_deduction_events (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, deduction_id uuid not null references public.wb_deductions on delete cascade, event_type text not null, note text, actor_id uuid references auth.users, created_at timestamptz not null default now());
create table public.enabled_modules (organization_id uuid not null references public.organizations on delete cascade, module public.module_key not null, enabled boolean not null default true, updated_at timestamptz not null default now(), primary key(organization_id,module));
create table public.dashboard_widgets (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, user_id uuid not null references auth.users on delete cascade, widget_key text not null, enabled boolean not null default true, position integer not null default 0, unique(organization_id,user_id,widget_key));
create table public.notification_settings (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, pickup_point_id uuid references public.pickup_points, settings jsonb not null default '{}'::jsonb, unique(organization_id,pickup_point_id));
create table public.telegram_integrations (id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations on delete cascade, status text not null default 'NOT_CONNECTED', created_at timestamptz not null default now());
create table public.early_access_requests (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, user_id uuid not null references auth.users, feature text not null default 'valuable_items', created_at timestamptz not null default now(), unique(organization_id,user_id,feature));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, actor_id uuid references auth.users, entity_type text not null, entity_id uuid, action text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.subscriptions (id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations on delete cascade, plan text not null default 'TRIAL' check(plan in ('TRIAL','START','PRO','BUSINESS')), trial_ends_at timestamptz, status text not null default 'ACTIVE', created_at timestamptz not null default now());

create or replace function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from organization_members where organization_id=org_id and user_id=auth.uid()) $$;
create or replace function public.is_org_owner(org_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from organization_members where organization_id=org_id and user_id=auth.uid() and role='OWNER') $$;
revoke all on function public.is_org_member(uuid), public.is_org_owner(uuid) from public;
grant execute on function public.is_org_member(uuid), public.is_org_owner(uuid) to authenticated;

-- Direct browser access is restricted to an authenticated member of the row's organization.
do $$ declare t text; begin foreach t in array array['pickup_points','employees','salary_rules','shifts','shift_changes','shift_templates','bonuses','employee_penalties','salary_periods','salary_accruals','salary_payments','income_entries','expense_categories','expense_entries','recurring_expenses','tax_settings','wb_deductions','wb_deduction_events','enabled_modules','dashboard_widgets','notification_settings','telegram_integrations','early_access_requests','audit_logs','subscriptions'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy org_select on public.%I for select to authenticated using (public.is_org_member(organization_id))',t); execute format('create policy org_write on public.%I for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))',t); end loop; end $$;
alter table public.organizations enable row level security;
create policy organization_select on public.organizations for select to authenticated using(public.is_org_member(id));
create policy organization_create on public.organizations for insert to authenticated with check(true);
create policy organization_owner_update on public.organizations for update to authenticated using(public.is_org_owner(id)) with check(public.is_org_owner(id));
alter table public.organization_members enable row level security;
create policy members_select on public.organization_members for select to authenticated using(public.is_org_member(organization_id));
create policy members_owner_write on public.organization_members for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
alter table public.employee_pickup_points enable row level security;
create policy employee_point_read on public.employee_pickup_points for select to authenticated using(exists(select 1 from public.employees e where e.id=employee_id and public.is_org_member(e.organization_id)));
create policy employee_point_owner on public.employee_pickup_points for all to authenticated using(exists(select 1 from public.employees e where e.id=employee_id and public.is_org_owner(e.organization_id))) with check(exists(select 1 from public.employees e where e.id=employee_id and public.is_org_owner(e.organization_id)));

create or replace function public.replace_shift(p_shift_id uuid,p_employee_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$ declare old_employee uuid; org uuid; begin select organization_id,employee_id into org,old_employee from shifts where id=p_shift_id for update; if not public.is_org_owner(org) then raise exception 'forbidden'; end if; update shifts set employee_id=p_employee_id,status='REPLACED',updated_at=now() where id=p_shift_id; insert into shift_changes(organization_id,shift_id,previous_employee_id,new_employee_id,reason,changed_by) values(org,p_shift_id,old_employee,p_employee_id,p_reason,auth.uid()); end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090002_telegram_manual_entry.sql
-- ────────────────────────────────────────────────────────────────────────────

create table public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid references auth.users on delete set null,
  telegram_chat_id bigint not null unique,
  telegram_user_id bigint not null,
  role public.member_role not null default 'OWNER',
  state jsonb not null default '{"step":"idle"}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index telegram_chats_org_idx on public.telegram_chats(organization_id);

create table public.telegram_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  code text not null unique check(code ~ '^[A-Z0-9]{8}$'),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_chats enable row level security;
alter table public.telegram_pairing_codes enable row level security;
create policy telegram_chats_owner_read on public.telegram_chats for select to authenticated using(public.is_org_owner(organization_id));
create policy telegram_pair_code_owner_all on public.telegram_pairing_codes for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id) and user_id=auth.uid());

create or replace function public.create_telegram_pairing_code(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  delete from public.telegram_pairing_codes where organization_id=p_organization_id and user_id=auth.uid() and used_at is null;
  new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.telegram_pairing_codes(organization_id,user_id,code) values(p_organization_id,auth.uid(),new_code);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090003_per_organization_telegram_bots.sql
-- ────────────────────────────────────────────────────────────────────────────

alter table public.telegram_integrations
  add column if not exists bot_id bigint,
  add column if not exists bot_username text,
  add column if not exists connected_by uuid references auth.users on delete set null,
  add column if not exists connected_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_error text;

create table public.telegram_bot_secrets (
  integration_id uuid primary key references public.telegram_integrations on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  encrypted_bot_token text not null,
  webhook_secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_bot_secrets enable row level security;
revoke all on public.telegram_bot_secrets from anon, authenticated;

alter table public.telegram_chats add column if not exists integration_id uuid references public.telegram_integrations on delete cascade;
alter table public.telegram_pairing_codes add column if not exists integration_id uuid references public.telegram_integrations on delete cascade;

alter table public.telegram_chats drop constraint if exists telegram_chats_telegram_chat_id_key;
create unique index if not exists telegram_chats_integration_chat_key on public.telegram_chats(integration_id, telegram_chat_id);

create or replace function public.create_telegram_pairing_code(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare
  new_code text;
  selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration
  from public.telegram_integrations
  where organization_id=p_organization_id and status='CONNECTED';
  if selected_integration is null then raise exception 'Сначала подключите Telegram-бота'; end if;
  delete from public.telegram_pairing_codes where organization_id=p_organization_id and user_id=auth.uid() and used_at is null;
  new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,code)
  values(p_organization_id,auth.uid(),selected_integration,new_code);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090004_onboarding.sql
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.create_organization_with_owner(
  p_name text, p_point_name text, p_point_address text,
  p_timezone text default 'Europe/Moscow'
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_point_name)) < 1 or length(trim(p_point_address)) < 1 then
    raise exception 'organization name, pickup point and address are required';
  end if;
  select organization_id into new_organization_id from public.organization_members
  where user_id = current_user_id limit 1;
  if new_organization_id is not null then return new_organization_id; end if;

  insert into public.organizations (name) values (trim(p_name)) returning id into new_organization_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'OWNER');
  insert into public.pickup_points (organization_id, name, address, timezone)
  values (new_organization_id, trim(p_point_name), trim(p_point_address), coalesce(nullif(trim(p_timezone), ''), 'Europe/Moscow'));
  insert into public.enabled_modules (organization_id, module)
  select new_organization_id, unnest(enum_range(null::public.module_key));
  insert into public.tax_settings (organization_id) values (new_organization_id);
  insert into public.subscriptions (organization_id, trial_ends_at)
  values (new_organization_id, now() + interval '14 days');
  insert into public.profiles (id, onboarding_completed) values (current_user_id, true)
  on conflict (id) do update set onboarding_completed = true, updated_at = now();
  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090005_presets_and_workflow.sql
-- ────────────────────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090006_wb_sync.sql
-- ────────────────────────────────────────────────────────────────────────────

alter table public.pickup_points add column if not exists wb_external_id bigint;
alter table public.employees add column if not exists wb_user_id bigint;
alter table public.wb_deductions add column if not exists wb_source text;
alter table public.wb_deductions add column if not exists wb_external_key text;

create unique index if not exists pickup_points_org_wb_external_uidx
  on public.pickup_points(organization_id, wb_external_id);
create unique index if not exists employees_org_wb_user_uidx
  on public.employees(organization_id, wb_user_id);
create unique index if not exists wb_deductions_org_source_key_uidx
  on public.wb_deductions(organization_id, wb_source, wb_external_key);

create table if not exists public.wb_integrations (
  organization_id uuid primary key references public.organizations on delete cascade,
  status text not null default 'NOT_CONNECTED'
    check (status in ('NOT_CONNECTED','AWAIT_CODE','CONNECTED','ERROR')),
  encrypted_session text,
  phone_hint text,
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wb_integrations enable row level security;
create policy wb_integrations_owner_select on public.wb_integrations
  for select to authenticated using (public.is_org_owner(organization_id));
revoke all on table public.wb_integrations from public, anon, authenticated;
grant select on table public.wb_integrations to authenticated;
grant select, insert, update, delete on table public.wb_integrations to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090007_salary_rate_catalog.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Справочник ставок организации: заводится один раз в разделе «Зарплаты»
-- и выбирается у сотрудника, чтобы сумму не приходилось вспоминать в каждой карточке.
create table if not exists public.salary_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check(length(trim(name)) > 0),
  payment_type public.payment_type not null,
  rate_kopecks bigint not null check(rate_kopecks >= 0),
  monthly_norm_days integer not null default 22 check(monthly_norm_days > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index if not exists salary_rates_org_idx on public.salary_rates(organization_id, payment_type);

alter table public.salary_rates enable row level security;
drop policy if exists org_select on public.salary_rates;
drop policy if exists org_write on public.salary_rates;
create policy org_select on public.salary_rates for select to authenticated using (public.is_org_member(organization_id));
create policy org_write on public.salary_rates for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

-- Ставки, заведённые по точкам, переезжают в общий справочник: одинаковые суммы схлопываются в одну запись.
insert into public.salary_rates(organization_id, name, payment_type, rate_kopecks, monthly_norm_days)
select distinct on (d.organization_id, d.payment_type, d.rate_kopecks)
  d.organization_id,
  case d.payment_type when 'SHIFT' then 'Смена' when 'HOURLY' then 'Час' else 'Оклад' end
    || ' · ' || to_char(d.rate_kopecks / 100.0, 'FM999999990') || ' ₽',
  d.payment_type, d.rate_kopecks, d.monthly_norm_days
from public.point_salary_defaults d
order by d.organization_id, d.payment_type, d.rate_kopecks, d.created_at
on conflict (organization_id, name) do nothing;

drop function if exists public.upsert_point_salary_default(uuid, public.payment_type, bigint, integer);
drop table if exists public.point_salary_defaults;

-- Ставка сотрудника ссылается на справочник, а часовая нужна для смен, отработанных не полностью.
alter table public.salary_rules add column if not exists salary_rate_id uuid references public.salary_rates on delete set null;
alter table public.salary_rules add column if not exists hourly_rate_kopecks bigint;
do $$ begin
  alter table public.salary_rules add constraint salary_rules_hourly_rate_check check(hourly_rate_kopecks is null or hourly_rate_kopecks >= 0);
exception when duplicate_object then null; end $$;

-- Режим оплаты конкретной смены: полная, половина или по фактическим часам.
alter table public.shifts add column if not exists pay_mode text not null default 'FULL';
do $$ begin
  alter table public.shifts add constraint shifts_pay_mode_check check(pay_mode in ('FULL','HALF','HOURS'));
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090008_optional_rate_name.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Название ставки нужно, только когда ставок одного типа несколько.
-- Обычной ставке хватает типа и суммы, поэтому имя становится необязательной пометкой.
alter table public.salary_rates drop constraint if exists salary_rates_name_check;
alter table public.salary_rates alter column name drop not null;
update public.salary_rates set name = null where length(trim(coalesce(name, ''))) = 0;
alter table public.salary_rates add constraint salary_rates_name_check check(name is null or length(trim(name)) > 0);

-- Две ставки одного типа с одинаковой суммой различить нечем — не даём их завести.
create unique index if not exists salary_rates_amount_idx on public.salary_rates(organization_id, payment_type, rate_kopecks);

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090009_default_salary_rate.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Ставка по умолчанию подставляется новому сотруднику: у большинства она одна на всех.
alter table public.salary_rates add column if not exists is_default boolean not null default false;
-- По умолчанию может быть только одна ставка на организацию.
create unique index if not exists salary_rates_default_idx on public.salary_rates(organization_id) where is_default;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090010_schedule_templates.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Сохранённый график («Основной 2/2») применяется повторно в два клика.
-- Таблица shift_templates была заведена под одного сотрудника и ни разу не использовалась,
-- поэтому расширяем её до ротации: участников в графике может быть несколько.
alter table public.shift_templates add column if not exists name text;
alter table public.shift_templates add column if not exists employee_ids uuid[] not null default '{}';
alter table public.shift_templates add column if not exists pay_mode text not null default 'FULL';
alter table public.shift_templates add column if not exists updated_at timestamptz not null default now();
alter table public.shift_templates alter column employee_id drop not null;
alter table public.shift_templates alter column pickup_point_id drop not null;

-- Если строки в старой форме всё же появились, переносим их, а не теряем.
update public.shift_templates set employee_ids = array[employee_id]
 where employee_id is not null and employee_ids = '{}';
update public.shift_templates set name = 'График'
 where name is null or length(trim(name)) = 0;

alter table public.shift_templates alter column name set not null;

do $$ begin
  alter table public.shift_templates add constraint shift_templates_name_check check(length(trim(name)) > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shift_templates add constraint shift_templates_pay_mode_check check(pay_mode in ('FULL','HALF','HOURS'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shift_templates add constraint shift_templates_name_unique unique(organization_id, name);
exception when duplicate_object then null; end $$;

create index if not exists shift_templates_org_idx on public.shift_templates(organization_id, active);

-- Политики пересоздаём, чтобы свежая база и уже развёрнутая сошлись в одном состоянии.
alter table public.shift_templates enable row level security;
drop policy if exists org_select on public.shift_templates;
drop policy if exists org_write on public.shift_templates;
create policy org_select on public.shift_templates for select to authenticated using (public.is_org_member(organization_id));
create policy org_write on public.shift_templates for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090011_point_bots_and_accounting.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Один бот на ПВЗ, безопасные повторы webhook и подтверждаемые регулярные расходы.
alter table public.telegram_integrations add column if not exists pickup_point_id uuid references public.pickup_points on delete cascade;

-- Старое подключение переносим автоматически только когда у организации одна активная точка.
update public.telegram_integrations i
set pickup_point_id = p.id
from public.pickup_points p
where i.pickup_point_id is null
  and p.organization_id = i.organization_id
  and p.archived_at is null
  and 1 = (select count(*) from public.pickup_points x where x.organization_id=i.organization_id and x.archived_at is null);

alter table public.telegram_integrations drop constraint if exists telegram_integrations_organization_id_key;
create unique index if not exists telegram_integrations_point_key on public.telegram_integrations(pickup_point_id) where pickup_point_id is not null;
create unique index if not exists telegram_integrations_bot_key on public.telegram_integrations(bot_id) where bot_id is not null;

alter table public.telegram_pairing_codes add column if not exists pickup_point_id uuid references public.pickup_points on delete cascade;
alter table public.telegram_pairing_codes add column if not exists employee_id uuid references public.employees on delete cascade;
alter table public.telegram_pairing_codes add column if not exists role public.member_role not null default 'OWNER';

create table if not exists public.telegram_updates (
  integration_id uuid not null references public.telegram_integrations on delete cascade,
  update_id bigint not null,
  received_at timestamptz not null default now(),
  primary key(integration_id, update_id)
);
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from anon, authenticated;
grant select, insert, delete on public.telegram_updates to service_role;

alter table public.salary_payments add column if not exists accrual_month date;
alter table public.salary_payments add column if not exists pickup_point_id uuid references public.pickup_points on delete set null;
update public.salary_payments set accrual_month=date_trunc('month', date)::date where accrual_month is null;
alter table public.salary_payments alter column accrual_month set not null;

create table if not exists public.recurring_expense_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  recurring_expense_id uuid not null references public.recurring_expenses on delete cascade,
  due_on date not null,
  status text not null default 'PENDING' check(status in ('PENDING','PAID','SKIPPED')),
  expense_entry_id uuid references public.expense_entries on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(recurring_expense_id,due_on)
);
alter table public.recurring_expense_occurrences enable row level security;
create policy recurring_occurrence_select on public.recurring_expense_occurrences for select to authenticated using(public.is_org_member(organization_id));
create policy recurring_occurrence_write on public.recurring_expense_occurrences for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

create or replace function public.confirm_recurring_expense(p_recurring_id uuid, p_due_on date)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.recurring_expenses; occurrence public.recurring_expense_occurrences; entry_id uuid;
begin
  select * into r from public.recurring_expenses where id=p_recurring_id for update;
  if r.id is null or not public.is_org_owner(r.organization_id) then raise exception 'forbidden'; end if;
  insert into public.recurring_expense_occurrences(organization_id,recurring_expense_id,due_on)
  values(r.organization_id,r.id,p_due_on) on conflict(recurring_expense_id,due_on) do nothing;
  select * into occurrence from public.recurring_expense_occurrences where recurring_expense_id=r.id and due_on=p_due_on for update;
  if occurrence.status='PAID' then return occurrence.expense_entry_id; end if;
  insert into public.expense_entries(organization_id,pickup_point_id,category_id,date,amount_kopecks,description)
  values(r.organization_id,r.pickup_point_id,r.category_id,p_due_on,r.amount_kopecks,r.description) returning id into entry_id;
  update public.recurring_expense_occurrences set status='PAID',expense_entry_id=entry_id,resolved_at=now() where id=occurrence.id;
  return entry_id;
end $$;
grant execute on function public.confirm_recurring_expense(uuid,date) to authenticated;

-- Обычное подтверждение означает работу по плану, а не время нажатия кнопки.
create or replace function public.confirm_shift_as_planned(p_shift_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid;
begin
  select organization_id into org from public.shifts where id=p_shift_id;
  if org is null or not public.is_org_owner(org) then raise exception 'forbidden'; end if;
  update public.shifts set status='COMPLETED',actual_start=planned_start,actual_end=planned_end,updated_at=now() where id=p_shift_id;
end $$;
grant execute on function public.confirm_shift_as_planned(uuid) to authenticated;

create or replace function public.prevent_employee_shift_overlap()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(
    select 1 from public.shifts s
    where s.employee_id=new.employee_id and s.id is distinct from new.id
      and s.status not in ('NO_SHOW','REPLACED')
      and tstzrange(s.planned_start,s.planned_end,'[)') && tstzrange(new.planned_start,new.planned_end,'[)')
  ) then raise exception 'У сотрудника уже есть пересекающаяся смена'; end if;
  return new;
end $$;
drop trigger if exists shifts_no_employee_overlap on public.shifts;
create trigger shifts_no_employee_overlap before insert or update of employee_id,planned_start,planned_end,status on public.shifts
for each row execute function public.prevent_employee_shift_overlap();

create or replace function public.create_telegram_pairing_code(p_organization_id uuid, p_pickup_point_id uuid, p_employee_id uuid default null)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text; selected_integration uuid; selected_role public.member_role;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.pickup_points where id=p_pickup_point_id and organization_id=p_organization_id and archived_at is null) then raise exception 'ПВЗ не найден'; end if;
  if p_employee_id is not null and not exists(select 1 from public.employee_pickup_points where employee_id=p_employee_id and pickup_point_id=p_pickup_point_id) then raise exception 'Сотрудник не работает на этом ПВЗ'; end if;
  select id into selected_integration from public.telegram_integrations where organization_id=p_organization_id and pickup_point_id=p_pickup_point_id and status='CONNECTED';
  if selected_integration is null then raise exception 'Сначала подключите Telegram-бота этого ПВЗ'; end if;
  selected_role := case when p_employee_id is null then 'OWNER'::public.member_role else 'EMPLOYEE'::public.member_role end;
  delete from public.telegram_pairing_codes
  where integration_id=selected_integration and user_id=auth.uid() and used_at is null
    and employee_id is not distinct from p_employee_id;
  new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,pickup_point_id,employee_id,role,code)
  values(p_organization_id,auth.uid(),selected_integration,p_pickup_point_id,p_employee_id,selected_role,new_code);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid,uuid,uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090012_shift_slots.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Места на смене: у точки задано, сколько человек должно выходить в день, а у смены —
-- какое из мест она занимает. Отсюда берутся «дырки в графике» и очередь на каждое место.

-- {"def":2} — два места каждый день; {"def":1,"wd":{"4":2,"5":2,"6":2}} — по одному,
-- но пт–вс по два. Ключи wd — дни недели от понедельника (0) до воскресенья (6).
alter table public.pickup_points add column if not exists slot_config jsonb not null default '{"def":1}'::jsonb;
alter table public.pickup_points drop constraint if exists pickup_points_slot_config_check;
alter table public.pickup_points add constraint pickup_points_slot_config_check
  check (jsonb_typeof(slot_config->'def')='number' and (slot_config->'def')::int between 1 and 8);

alter table public.shifts add column if not exists slot_index int not null default 0;
alter table public.shifts drop constraint if exists shifts_slot_index_check;
alter table public.shifts add constraint shifts_slot_index_check check (slot_index >= 0);

-- Календарный день смены отдельной колонкой. Выражение по planned_start в индекс не годится:
-- приведение timestamptz к дате зависит от часового пояса сессии и потому не immutable.
-- Считаем день в поясе самой точки — ночная смена с 21:00 остаётся днём своего начала.
alter table public.shifts add column if not exists work_date date;

create or replace function public.shifts_fill_slot()
returns trigger language plpgsql set search_path=public as $$
declare zone text; taken int[];
begin
  select coalesce(timezone,'Europe/Moscow') into zone from public.pickup_points where id=new.pickup_point_id;
  new.work_date := (new.planned_start at time zone coalesce(zone,'Europe/Moscow'))::date;

  -- Место занято другой сменой — отдаём ближайшее свободное. Так любой писатель (старый
  -- экран, бот, синхронизация WB) остаётся рабочим, не зная про места, а осознанный выбор
  -- места делает мастер графика.
  if new.status in ('PLANNED','ON_DUTY','COMPLETED') then
    select coalesce(array_agg(slot_index), '{}') into taken
    from public.shifts
    where pickup_point_id=new.pickup_point_id and work_date=new.work_date
      and status in ('PLANNED','ON_DUTY','COMPLETED') and id is distinct from new.id;
    while new.slot_index = any(taken) loop new.slot_index := new.slot_index + 1; end loop;
  end if;
  return new;
end $$;

drop trigger if exists shifts_fill_slot on public.shifts;
create trigger shifts_fill_slot before insert or update of planned_start,pickup_point_id,slot_index,status on public.shifts
for each row execute function public.shifts_fill_slot();

-- Бэкфилл: день берём так же, как тригер, а места нумеруем по порядку начала смены.
update public.shifts s
set work_date = (s.planned_start at time zone coalesce(p.timezone,'Europe/Moscow'))::date
from public.pickup_points p
where p.id = s.pickup_point_id and s.work_date is null;

with numbered as (
  select id, row_number() over (
    partition by pickup_point_id, work_date order by planned_start, employee_id
  ) - 1 as position
  from public.shifts
  where status in ('PLANNED','ON_DUTY','COMPLETED')
)
update public.shifts s set slot_index = n.position from numbered n where n.id = s.id and s.slot_index <> n.position;

alter table public.shifts alter column work_date set not null;

-- Одна смена на место в дне. До сих пор в shifts не было ни одного уникального ограничения,
-- и от дублей спасала только дедупликация в JS при применении графика.
create unique index if not exists shifts_point_date_slot_uq
  on public.shifts(pickup_point_id, work_date, slot_index)
  where status in ('PLANNED','ON_DUTY','COMPLETED');

create index if not exists shifts_point_date_idx on public.shifts(pickup_point_id, work_date);

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090013_requests_and_vacations.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Роли: менеджер может вести операционку (график, деньги, удержания), но не трогает
-- ставки, настройки и интеграции. Полный разбор политик — в миграции 0018, здесь только
-- помощники: на них уже опираются функции этой и следующих миграций.
create or replace function public.is_org_manager(org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id=org_id and m.user_id=auth.uid() and m.role in ('OWNER','MANAGER')
  )
$$;
revoke all on function public.is_org_manager(uuid) from public;
grant execute on function public.is_org_manager(uuid) to authenticated;

-- Какой сотрудник стоит за текущим пользователем. Пусто у владельца, который сам не выходит в смены.
create or replace function public.current_employee_id(org_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select m.employee_id from public.organization_members m
  where m.organization_id=org_id and m.user_id=auth.uid()
$$;
revoke all on function public.current_employee_id(uuid) from public;
grant execute on function public.current_employee_id(uuid) to authenticated;

-- Заявки сотрудника («не смогу выйти», отпуск, больничный) и сами отпуска.
-- Отпуск храним, а не выводим из заявок: генерация графика и расчёт зарплаты должны видеть
-- его детерминированно, а владелец вправе отметить отпуск задним числом вообще без заявки.

create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  pickup_point_id uuid references public.pickup_points on delete set null,
  kind text not null check(kind in ('SHIFT','VACATION','SICK')),
  date_from date not null,
  date_to date not null,
  reason text,
  -- Статусы повторяют решения владельца из прототипа: нашли замену, выйдет один,
  -- согласовано как есть, отказано.
  status text not null default 'SENT'
    check(status in ('SENT','SUBSTITUTE_FOUND','ALONE','APPROVED','DECLINED')),
  substitute_employee_id uuid references public.employees on delete set null,
  resolution_comment text,
  resolved_by uuid references auth.users on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check(date_to >= date_from)
);
create index if not exists shift_requests_open_idx on public.shift_requests(organization_id, status);
create index if not exists shift_requests_employee_idx on public.shift_requests(employee_id, date_from);

create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  date_from date not null,
  date_to date not null,
  kind text not null default 'UNPAID' check(kind in ('PAID','UNPAID','SICK')),
  source_request_id uuid references public.shift_requests on delete set null,
  comment text,
  created_at timestamptz not null default now(),
  check(date_to >= date_from)
);
create index if not exists vacations_employee_idx on public.vacations(employee_id, date_from);

alter table public.shift_requests enable row level security;
alter table public.vacations enable row level security;
-- Полные политики по ролям ставит миграция 0018; пока доступ как у остальных таблиц.
create policy org_select on public.shift_requests for select to authenticated using(public.is_org_member(organization_id));
create policy org_write on public.shift_requests for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
create policy org_select on public.vacations for select to authenticated using(public.is_org_member(organization_id));
create policy org_write on public.vacations for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

/**
 * Решение владельца по заявке одним вызовом: статус, замена и, для отпуска, запись в vacations.
 *
 * Замену делаем сменой сотрудника в той же смене со статусом PLANNED, а не через
 * replace_shift: тот помечает смену REPLACED, и она перестаёт оплачиваться — а вышедшему
 * на замену платить надо. История всё равно попадает в shift_changes.
 */
create or replace function public.resolve_shift_request(
  p_request_id uuid,
  p_status text,
  p_substitute uuid default null,
  p_comment text default null
) returns void language plpgsql security definer set search_path=public as $$
declare r public.shift_requests;
begin
  select * into r from public.shift_requests where id=p_request_id for update;
  if r.id is null or not public.is_org_manager(r.organization_id) then raise exception 'forbidden'; end if;
  if p_status not in ('SUBSTITUTE_FOUND','ALONE','APPROVED','DECLINED') then raise exception 'Неизвестное решение'; end if;
  if p_status='SUBSTITUTE_FOUND' and p_substitute is null then raise exception 'Не выбран сотрудник на замену'; end if;

  update public.shift_requests
  set status=p_status, substitute_employee_id=p_substitute, resolution_comment=p_comment,
      resolved_by=auth.uid(), resolved_at=now()
  where id=r.id;

  if p_status='SUBSTITUTE_FOUND' then
    -- Заявка может закрывать несколько дней подряд — переназначаем все смены отрезка.
    insert into public.shift_changes(organization_id,shift_id,previous_employee_id,new_employee_id,reason,changed_by)
    select r.organization_id, s.id, s.employee_id, p_substitute, coalesce(p_comment,'Замена по заявке'), auth.uid()
    from public.shifts s
    where s.employee_id=r.employee_id and s.status='PLANNED'
      and s.work_date between r.date_from and r.date_to;

    update public.shifts s
    set employee_id=p_substitute, updated_at=now()
    where s.employee_id=r.employee_id and s.status='PLANNED'
      and s.work_date between r.date_from and r.date_to;
  end if;

  if p_status in ('APPROVED','SUBSTITUTE_FOUND','ALONE') and r.kind in ('VACATION','SICK') then
    insert into public.vacations(organization_id,employee_id,date_from,date_to,kind,source_request_id,comment)
    values(r.organization_id,r.employee_id,r.date_from,r.date_to,
           case when r.kind='SICK' then 'SICK' else 'UNPAID' end, r.id, r.reason);
  end if;
end $$;
grant execute on function public.resolve_shift_request(uuid,text,uuid,text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090014_deduction_parts.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Удержание WB можно разделить между несколькими сотрудниками: в прототипе 2 400 ₽
-- делятся как «Ирина 1 000, Камила 1 000, 400 — убыток владельца».

create table if not exists public.wb_deduction_parts (
  deduction_id uuid not null references public.wb_deductions on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  amount_kopecks bigint not null check(amount_kopecks > 0),
  created_at timestamptz not null default now(),
  primary key(deduction_id, employee_id)
);
create index if not exists wb_deduction_parts_employee_idx on public.wb_deduction_parts(employee_id);

-- Убыток владельца не храним: это остаток, amount_kopecks − сумма частей. Отдельная
-- колонка разошлась бы с частями при первой же правке.
create or replace function public.wb_parts_within_amount()
returns trigger language plpgsql set search_path=public as $$
declare total bigint; limit_amount bigint;
begin
  select amount_kopecks into limit_amount from public.wb_deductions where id=new.deduction_id;
  select coalesce(sum(amount_kopecks),0) into total from public.wb_deduction_parts
  where deduction_id=new.deduction_id and employee_id is distinct from new.employee_id;
  if total + new.amount_kopecks > limit_amount then
    raise exception 'Сумма по сотрудникам больше удержания';
  end if;
  return new;
end $$;
drop trigger if exists wb_parts_within_amount on public.wb_deduction_parts;
create trigger wb_parts_within_amount before insert or update on public.wb_deduction_parts
for each row execute function public.wb_parts_within_amount();

-- Сотрудник может не согласиться с удержанием. Его реплика — обычное событие в истории
-- удержания, отдельной таблицы не нужно; автор отмечается, чтобы владелец видел, кто ответил.
alter table public.wb_deduction_events add column if not exists author_employee_id uuid references public.employees on delete set null;

alter table public.wb_deduction_parts enable row level security;
create policy org_select on public.wb_deduction_parts for select to authenticated using(public.is_org_member(organization_id));
create policy org_write on public.wb_deduction_parts for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

/**
 * Переразложить удержание по сотрудникам одним вызовом: прежние части заменяются целиком.
 * Пустой список означает «полностью убыток владельца».
 */
create or replace function public.set_deduction_parts(p_deduction_id uuid, p_parts jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d public.wb_deductions;
begin
  select * into d from public.wb_deductions where id=p_deduction_id for update;
  if d.id is null or not public.is_org_manager(d.organization_id) then raise exception 'forbidden'; end if;

  delete from public.wb_deduction_parts where deduction_id=d.id;
  insert into public.wb_deduction_parts(deduction_id,employee_id,organization_id,amount_kopecks)
  select d.id, (part->>'employeeId')::uuid, d.organization_id, (part->>'amountKopecks')::bigint
  from jsonb_array_elements(coalesce(p_parts,'[]'::jsonb)) as part
  where (part->>'amountKopecks')::bigint > 0;

  -- Статус ведём за составом: есть кому предъявить — «на сотруднике», иначе убыток владельца.
  update public.wb_deductions
  set status = case when exists(select 1 from public.wb_deduction_parts where deduction_id=d.id)
                    then 'EMPLOYEE_LIABILITY'::public.deduction_status
                    else 'OWNER_LOSS'::public.deduction_status end,
      updated_at = now()
  where id=d.id;

  insert into public.wb_deduction_events(organization_id,deduction_id,event_type,note,actor_id)
  values(d.organization_id, d.id, 'PARTS_UPDATED',
         (select coalesce(string_agg(e.full_name || ' — ' || (p.amount_kopecks/100)::text || ' ₽', ', '), 'Полностью убыток владельца')
          from public.wb_deduction_parts p join public.employees e on e.id=p.employee_id
          where p.deduction_id=d.id),
         auth.uid());
end $$;
grant execute on function public.set_deduction_parts(uuid,jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090015_employee_invitations.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Приглашение сотрудника в приложение: код вида ABC-D3F и ссылка /join/ABC-D3F.

create table if not exists public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  code text not null unique check(code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  status text not null default 'SENT' check(status in ('SENT','ACCEPTED','REVOKED')),
  created_by uuid references auth.users on delete set null,
  accepted_by uuid references auth.users on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
-- Одно живое приглашение на сотрудника: иначе по организации ходит несколько рабочих кодов.
create unique index if not exists employee_invitations_active_uq
  on public.employee_invitations(employee_id) where status='SENT';

alter table public.employee_invitations enable row level security;
-- Читает только владелец: код короткий, и select по нему для всех авторизованных
-- означал бы перебор. Приём идёт исключительно через RPC ниже.
create policy invitations_owner on public.employee_invitations for all to authenticated
  using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

-- Неудачные попытки приёма: защита от перебора кодов.
create table if not exists public.invitation_attempts (
  user_id uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invitation_attempts_idx on public.invitation_attempts(user_id, attempted_at desc);
alter table public.invitation_attempts enable row level security;
revoke all on public.invitation_attempts from anon, authenticated;

/** Код без похожих друг на друга символов: 0/O и 1/I на бумажке не различить. */
create or replace function public.generate_invitation_code()
returns text language plpgsql set search_path=public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    if i = 3 then result := result || '-'; end if;
  end loop;
  return result;
end $$;

/** Создать (или перевыпустить) приглашение сотруднику. Старое живое отзывается. */
create or replace function public.create_employee_invitation(p_employee_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare org uuid; new_code text;
begin
  select organization_id into org from public.employees where id=p_employee_id;
  if org is null or not public.is_org_owner(org) then raise exception 'forbidden'; end if;

  update public.employee_invitations set status='REVOKED' where employee_id=p_employee_id and status='SENT';

  loop
    new_code := public.generate_invitation_code();
    exit when not exists(select 1 from public.employee_invitations where code=new_code);
  end loop;

  insert into public.employee_invitations(organization_id,employee_id,code,created_by)
  values(org,p_employee_id,new_code,auth.uid());
  return new_code;
end $$;
grant execute on function public.create_employee_invitation(uuid) to authenticated;

/**
 * Принять приглашение: связывает вошедшего пользователя с карточкой сотрудника.
 * Возвращает организацию и сотрудника, чтобы приложение сразу открыло нужный экран.
 *
 * Неверный код — не исключение, а ответ `{ error }`. Исключение откатило бы транзакцию
 * вместе с записью о неудачной попытке, и ограничение на перебор никогда бы не сработало.
 */
create or replace function public.accept_employee_invitation(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation public.employee_invitations; failures int;
begin
  if auth.uid() is null then raise exception 'Нужно войти в приложение'; end if;

  -- Не больше десяти неудачных попыток в час на пользователя.
  select count(*) into failures from public.invitation_attempts
  where user_id=auth.uid() and attempted_at > now() - interval '1 hour';
  if failures >= 10 then
    return jsonb_build_object('error', 'Слишком много попыток, попробуйте через час');
  end if;

  select * into invitation from public.employee_invitations
  where code=upper(trim(p_code)) and status='SENT' and expires_at > now() for update;

  if invitation.id is null then
    insert into public.invitation_attempts(user_id) values(auth.uid());
    return jsonb_build_object('error', 'Код не найден или устарел');
  end if;

  insert into public.organization_members(organization_id,user_id,employee_id,role)
  values(invitation.organization_id, auth.uid(), invitation.employee_id, 'EMPLOYEE')
  on conflict(organization_id,user_id) do update set employee_id=excluded.employee_id;

  update public.employee_invitations
  set status='ACCEPTED', accepted_by=auth.uid(), accepted_at=now()
  where id=invitation.id;

  delete from public.invitation_attempts where user_id=auth.uid();

  return jsonb_build_object('organizationId', invitation.organization_id, 'employeeId', invitation.employee_id);
end $$;
grant execute on function public.accept_employee_invitation(text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090016_payout_settings.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Когда и как платить: дни аванса и остатка, способ расчёта аванса.
-- Отдельная таблица, а не поле в organizations: у неё своя видимость (деньги сотрудник
-- не смотрит) и её читает каждый экран «Деньги».

create table if not exists public.payout_settings (
  organization_id uuid primary key references public.organizations on delete cascade,
  advance_day int not null default 15 check(advance_day between 1 and 31),
  payday int not null default 1 check(payday between 1 and 31),
  -- FIXED — одна и та же сумма; CALC — ставка × смены за первую половину месяца;
  -- MANUAL — владелец вводит сумму каждый раз.
  advance_mode text not null default 'CALC' check(advance_mode in ('FIXED','CALC','MANUAL')),
  advance_sum_kopecks bigint not null default 0 check(advance_sum_kopecks >= 0),
  updated_at timestamptz not null default now()
);

alter table public.payout_settings enable row level security;
create policy org_select on public.payout_settings for select to authenticated using(public.is_org_member(organization_id));
create policy org_write on public.payout_settings for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

insert into public.payout_settings(organization_id)
select id from public.organizations on conflict(organization_id) do nothing;

-- Новым организациям настройки заводятся вместе с остальным первичным набором.
create or replace function public.payout_settings_for_new_org()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.payout_settings(organization_id) values(new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists organizations_payout_defaults on public.organizations;
create trigger organizations_payout_defaults after insert on public.organizations
for each row execute function public.payout_settings_for_new_org();

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090017_notification_reads.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Лента уведомлений собирается на клиенте из того, что уже есть в базе: открытые заявки,
-- новые удержания, дырки в графике, неподтверждённые регулярные расходы, сроки выплат.
-- Материализовать её значило бы завести пять триггеров и ловить рассинхрон, поэтому
-- в базе храним только одно, чего из данных не вывести, — что пользователь это уже видел.

create table if not exists public.notification_reads (
  user_id uuid not null references auth.users on delete cascade,
  -- Вид события: request, deduction, hole, recurring, payout.
  kind text not null,
  -- Ссылка на источник: id строки или синтетический ключ вида 'p1|2026-09-19' для дырки.
  ref_id text not null,
  read_at timestamptz not null default now(),
  primary key(user_id, kind, ref_id)
);

alter table public.notification_reads enable row level security;
create policy notification_reads_own on public.notification_reads for all to authenticated
  using(user_id = auth.uid()) with check(user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090018_role_policies.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Права по ролям.
--
-- До этой миграции на 25 таблицах стояла одна пара политик: читает любой участник
-- организации, пишет только владелец. Значит, любой добавленный участник — в том числе
-- будущий сотрудник с приложением — видел все зарплаты, всю выручку и все расходы.
-- Здесь чтение денег сужается до владельца и менеджера, сотруднику открываются только
-- собственные строки, а операционные таблицы получают право записи для менеджера.
--
-- Правило разделения: менеджер ведёт ежедневную работу (график, операции, удержания),
-- владелец — деньги как настройку (ставки, налог, дни выплат), состав участников и интеграции.

-- ---------- 1. Операционные таблицы: пишет менеджер ----------
do $$
declare t text;
begin
  foreach t in array array[
    'shifts','shift_changes','shift_requests','vacations',
    'income_entries','expense_entries','expense_categories',
    'recurring_expenses','recurring_expense_occurrences',
    'wb_deductions','wb_deduction_events','wb_deduction_parts',
    'bonuses','employee_penalties','entry_presets','employees'
  ] loop
    execute format('drop policy if exists org_write on public.%I', t);
    execute format('drop policy if exists recurring_occurrence_write on public.%I', t);
    execute format($p$create policy mgr_write on public.%I for all to authenticated
      using(public.is_org_manager(organization_id)) with check(public.is_org_manager(organization_id))$p$, t);
  end loop;
end $$;

-- ---------- 2. Деньги и настройки: читает менеджер ----------
do $$
declare t text;
begin
  foreach t in array array[
    'salary_rules','salary_rates','salary_periods','salary_accruals','salary_payments',
    'bonuses','employee_penalties',
    'income_entries','expense_entries','expense_categories',
    'recurring_expenses','recurring_expense_occurrences','entry_presets',
    'tax_settings','payout_settings','subscriptions',
    'enabled_modules','dashboard_widgets','notification_settings','audit_logs',
    'telegram_integrations','early_access_requests','employees'
  ] loop
    execute format('drop policy if exists org_select on public.%I', t);
    execute format('drop policy if exists recurring_occurrence_select on public.%I', t);
    execute format('create policy mgr_select on public.%I for select to authenticated using(public.is_org_manager(organization_id))', t);
  end loop;
end $$;

-- ---------- 3. Сотруднику — свои строки ----------
-- Начисления, выплаты, премии и штрафы каждый видит только про себя. Ставку — тоже:
-- без неё в приложении нельзя показать, из чего сложилась сумма.
do $$
declare t text;
begin
  foreach t in array array['salary_rules','salary_accruals','salary_payments','bonuses','employee_penalties'] loop
    execute format($p$create policy own_rows on public.%I for select to authenticated
      using(employee_id = public.current_employee_id(organization_id))$p$, t);
  end loop;
end $$;

-- Карточки коллег отдаём через представление с безопасным набором полей: в самой таблице
-- лежат телефон, telegram и wb_user_id, которым между сотрудниками делать нечего.
-- Представление намеренно работает правами владельца (security_invoker не включаем):
-- сама таблица employees закрыта от сотрудника, а фильтр по организации стоит внутри.
create or replace view public.employees_public with (security_barrier=true) as
  select e.id, e.organization_id, e.full_name, e.status
  from public.employees e
  where public.is_org_member(e.organization_id);
grant select on public.employees_public to authenticated;

-- Свои привязки к точкам сотрудник видит, чужие — нет.
drop policy if exists employee_point_read on public.employee_pickup_points;
create policy employee_point_read on public.employee_pickup_points for select to authenticated
  using(exists(
    select 1 from public.employees e
    where e.id = employee_id
      and (public.is_org_manager(e.organization_id) or e.id = public.current_employee_id(e.organization_id))
  ));

-- Привязку сотрудника к точке меняет менеджер: это часть ведения графика, а не настройка.
drop policy if exists employee_point_owner on public.employee_pickup_points;
create policy employee_point_write on public.employee_pickup_points for all to authenticated
  using(exists(select 1 from public.employees e where e.id=employee_id and public.is_org_manager(e.organization_id)))
  with check(exists(select 1 from public.employees e where e.id=employee_id and public.is_org_manager(e.organization_id)));

-- ---------- 4. Смены ----------
-- Свои смены и тех, с кем стоишь в один день на одной точке: приложение показывает напарника.
-- Проверку выносим в security definer функцию — подзапрос по shifts внутри политики
-- на shifts зациклил бы проверку прав.
create or replace function public.shares_shift_day(org_id uuid, point_id uuid, day date)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.shifts s
    where s.organization_id=org_id and s.pickup_point_id=point_id and s.work_date=day
      and s.employee_id = public.current_employee_id(org_id)
  )
$$;
revoke all on function public.shares_shift_day(uuid,uuid,date) from public;
grant execute on function public.shares_shift_day(uuid,uuid,date) to authenticated;

drop policy if exists org_select on public.shifts;
create policy shifts_read on public.shifts for select to authenticated using(
  public.is_org_manager(organization_id)
  or employee_id = public.current_employee_id(organization_id)
  or public.shares_shift_day(organization_id, pickup_point_id, work_date)
);

/**
 * Начать и завершить свою смену. Прямой update сотруднику не даём: через него можно
 * переписать режим оплаты и время, то есть собственную зарплату.
 */
create or replace function public.employee_start_shift(p_shift_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.shifts;
begin
  select * into s from public.shifts where id=p_shift_id for update;
  if s.id is null or s.employee_id is distinct from public.current_employee_id(s.organization_id) then raise exception 'forbidden'; end if;
  if s.status <> 'PLANNED' then raise exception 'Смена уже начата или закрыта'; end if;
  update public.shifts set status='ON_DUTY', actual_start=now(), updated_at=now() where id=s.id;
end $$;
grant execute on function public.employee_start_shift(uuid) to authenticated;

create or replace function public.employee_end_shift(p_shift_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.shifts;
begin
  select * into s from public.shifts where id=p_shift_id for update;
  if s.id is null or s.employee_id is distinct from public.current_employee_id(s.organization_id) then raise exception 'forbidden'; end if;
  if s.status <> 'ON_DUTY' then raise exception 'Смена не начата'; end if;
  update public.shifts set status='COMPLETED', actual_end=now(), updated_at=now() where id=s.id;
end $$;
grant execute on function public.employee_end_shift(uuid) to authenticated;

-- ---------- 5. Заявки и отпуска ----------
drop policy if exists org_select on public.shift_requests;
create policy requests_read on public.shift_requests for select to authenticated using(
  public.is_org_manager(organization_id)
  or employee_id = public.current_employee_id(organization_id)
  or substitute_employee_id = public.current_employee_id(organization_id)
);
-- Сотрудник создаёт заявку только на себя и только в статусе «отправлена»;
-- решение принимает владелец через resolve_shift_request.
create policy requests_employee_create on public.shift_requests for insert to authenticated
  with check(employee_id = public.current_employee_id(organization_id) and status='SENT');
-- Отозвать можно только свою и только пока она не решена.
create policy requests_employee_cancel on public.shift_requests for update to authenticated
  using(employee_id = public.current_employee_id(organization_id) and status='SENT')
  with check(employee_id = public.current_employee_id(organization_id) and status='DECLINED');

drop policy if exists org_select on public.vacations;
create policy vacations_read on public.vacations for select to authenticated using(
  public.is_org_manager(organization_id) or employee_id = public.current_employee_id(organization_id)
);

-- ---------- 6. Удержания WB ----------
-- Удержание «на сотруднике» бывает двух видов: назначенное целиком (старое поле
-- employee_id) и разделённое на части. Сотрудник должен видеть оба — иначе из зарплаты
-- вычитается то, чего он в приложении не видит и с чем не может не согласиться.
create or replace function public.deduction_is_mine(p_deduction_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.wb_deductions d
    where d.id = p_deduction_id
      and (d.employee_id = public.current_employee_id(d.organization_id)
           or exists(select 1 from public.wb_deduction_parts p
                     where p.deduction_id = d.id and p.employee_id = public.current_employee_id(d.organization_id)))
  )
$$;
revoke all on function public.deduction_is_mine(uuid) from public;
grant execute on function public.deduction_is_mine(uuid) to authenticated;

drop policy if exists org_select on public.wb_deductions;
create policy deductions_read on public.wb_deductions for select to authenticated using(
  public.is_org_manager(organization_id) or public.deduction_is_mine(id)
);

drop policy if exists org_select on public.wb_deduction_parts;
create policy deduction_parts_read on public.wb_deduction_parts for select to authenticated using(
  public.is_org_manager(organization_id) or employee_id = public.current_employee_id(organization_id)
);

drop policy if exists org_select on public.wb_deduction_events;
create policy deduction_events_read on public.wb_deduction_events for select to authenticated using(
  public.is_org_manager(organization_id) or public.deduction_is_mine(deduction_id)
);
-- Единственная запись, доступная сотруднику: «не согласен» по удержанию, которое на нём.
create policy deduction_events_disagree on public.wb_deduction_events for insert to authenticated
  with check(
    event_type = 'EMPLOYEE_DISAGREE'
    and author_employee_id = public.current_employee_id(organization_id)
    and public.deduction_is_mine(deduction_id)
  );

-- ---------- 7. Существующие функции: операционку ведёт менеджер ----------
create or replace function public.replace_shift(p_shift_id uuid,p_employee_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare old_employee uuid; org uuid;
begin
  select organization_id,employee_id into org,old_employee from shifts where id=p_shift_id for update;
  if not public.is_org_manager(org) then raise exception 'forbidden'; end if;
  update shifts set employee_id=p_employee_id,status='REPLACED',updated_at=now() where id=p_shift_id;
  insert into shift_changes(organization_id,shift_id,previous_employee_id,new_employee_id,reason,changed_by)
  values(org,p_shift_id,old_employee,p_employee_id,p_reason,auth.uid());
end $$;

create or replace function public.confirm_shift_as_planned(p_shift_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid;
begin
  select organization_id into org from public.shifts where id=p_shift_id;
  if org is null or not public.is_org_manager(org) then raise exception 'forbidden'; end if;
  update public.shifts set status='COMPLETED',actual_start=planned_start,actual_end=planned_end,updated_at=now() where id=p_shift_id;
end $$;

create or replace function public.upsert_entry_preset(p_pickup_point_id uuid, p_kind text, p_category text, p_amount bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; preset_id uuid;
begin
  select organization_id into org from public.pickup_points where id=p_pickup_point_id;
  if org is null or not public.is_org_manager(org) then raise exception 'forbidden'; end if;
  if p_kind not in ('INCOME','EXPENSE') then raise exception 'Неизвестный вид операции'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_category is null or length(trim(p_category)) = 0 then raise exception 'Категория не указана'; end if;

  insert into public.entry_presets(organization_id,pickup_point_id,kind,category_name,amount_kopecks)
  values(org,p_pickup_point_id,p_kind,trim(p_category),p_amount)
  on conflict(organization_id,pickup_point_id,kind,category_name)
  do update set amount_kopecks=excluded.amount_kopecks, updated_at=now()
  returning id into preset_id;
  return preset_id;
end $$;

create or replace function public.confirm_recurring_expense(p_recurring_id uuid, p_due_on date)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.recurring_expenses; occurrence public.recurring_expense_occurrences; entry_id uuid;
begin
  select * into r from public.recurring_expenses where id=p_recurring_id for update;
  if r.id is null or not public.is_org_manager(r.organization_id) then raise exception 'forbidden'; end if;
  insert into public.recurring_expense_occurrences(organization_id,recurring_expense_id,due_on)
  values(r.organization_id,r.id,p_due_on) on conflict(recurring_expense_id,due_on) do nothing;
  select * into occurrence from public.recurring_expense_occurrences where recurring_expense_id=r.id and due_on=p_due_on for update;
  if occurrence.status='PAID' then return occurrence.expense_entry_id; end if;
  insert into public.expense_entries(organization_id,pickup_point_id,category_id,date,amount_kopecks,description)
  values(r.organization_id,r.pickup_point_id,r.category_id,p_due_on,r.amount_kopecks,r.description) returning id into entry_id;
  update public.recurring_expense_occurrences set status='PAID',expense_entry_id=entry_id,resolved_at=now() where id=occurrence.id;
  return entry_id;
end $$;

-- ---------- 8. Кабинет сотрудника ----------
-- Своя карточка: имя, телефон, способ оплаты. Без этой политики сотрудник не видел бы
-- и собственных привязок к точкам — политика employee_point_read проверяет их
-- подзапросом к employees, а таблица закрыта от него целиком.
create policy employees_self_read on public.employees for select to authenticated
  using(id = public.current_employee_id(organization_id));

-- Дни выплат видит вся организация: «аванс 15-го, остаток 5-го» сотруднику нужно знать
-- так же, как владельцу. Сумма аванса в фиксированном режиме — не секрет того же уровня,
-- что чужие зарплаты: она одна на всех.
create policy payout_settings_member_read on public.payout_settings for select to authenticated
  using(public.is_org_member(organization_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090019_indexes.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Индексы под запросы новых экранов. Все — по organization_id первым полем: RLS всё равно
-- фильтрует по организации, и без него индекс не используется.

-- Сетка графика за месяц по одной точке.
create index if not exists shifts_org_point_start_idx on public.shifts(organization_id, pickup_point_id, planned_start);
-- «Мои смены» у сотрудника.
create index if not exists shifts_employee_date_idx on public.shifts(employee_id, work_date);
-- Колокольчик владельца: открытые заявки и новые удержания.
create index if not exists wb_deductions_status_idx on public.wb_deductions(organization_id, status, created_at desc);
-- Ведомость за месяц.
create index if not exists salary_payments_month_idx on public.salary_payments(organization_id, accrual_month);
create index if not exists bonuses_month_idx on public.bonuses(organization_id, date);
create index if not exists penalties_month_idx on public.employee_penalties(organization_id, date);
-- Доходы и расходы месяца на экране «Деньги».
create index if not exists income_month_idx on public.income_entries(organization_id, date);
create index if not exists expense_month_idx on public.expense_entries(organization_id, date);

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090020_replace_shift_pays.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Замена сотрудника больше не отменяет смену.
--
-- replace_shift переписывал смену на заменяющего и ставил ей статус REPLACED. Но REPLACED
-- везде читается как «смены нет»: в расчёт зарплаты идут только COMPLETED, график и кабинет
-- такую смену прячут. Итог — вышедший на замену не получал ничего, а день выглядел пустым.
--
-- Теперь замена — это только смена сотрудника в той же строке, статус не трогаем (как уже
-- делает resolve_shift_request из 0013). Кто кого заменил и почему — в shift_changes.

create or replace function public.replace_shift(p_shift_id uuid,p_employee_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare old_employee uuid; org uuid;
begin
  select organization_id,employee_id into org,old_employee from public.shifts where id=p_shift_id for update;
  if org is null or not public.is_org_manager(org) then raise exception 'forbidden'; end if;
  -- Заменяющий должен быть из той же организации: security definer обходит RLS.
  if not exists(select 1 from public.employees where id=p_employee_id and organization_id=org) then
    raise exception 'Сотрудник не найден';
  end if;
  if old_employee = p_employee_id then return; end if;
  update public.shifts set employee_id=p_employee_id,updated_at=now() where id=p_shift_id;
  insert into public.shift_changes(organization_id,shift_id,previous_employee_id,new_employee_id,reason,changed_by)
  values(org,p_shift_id,old_employee,p_employee_id,p_reason,auth.uid());
end $$;
grant execute on function public.replace_shift(uuid,uuid,text) to authenticated;

-- Уже заменённые смены возвращаем в работу. Строка и так принадлежит заменяющему
-- (replace_shift переписывал employee_id), не хватало только статуса.
-- Прошедшие дни становятся PLANNED, а не COMPLETED: выход по-прежнему подтверждает владелец
-- («Вышел» в шторке дня) — придумывать факт выхода миграцией нельзя.
update public.shifts s
set status='PLANNED', updated_at=now()
where s.status='REPLACED'
  and exists(select 1 from public.shift_changes c where c.shift_id=s.id and c.new_employee_id=s.employee_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090021_telegram_reminders.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Напоминания бота в рабочую группу точки.
--
-- До сих пор бот только принимал сообщения. Теперь у каждого бота (а он привязан к одному
-- ПВЗ) есть чат-получатель — группа, куда по расписанию уходят дежурство на сегодня,
-- дежурство на завтра, дырки в графике и напоминание внести расходы.
--
-- Время хранится как `time` без пояса и считается местным временем точки: владелец задаёт
-- «в 8:30», и это 8:30 у этого ПВЗ, а не в UTC.

-- Миграция меняет pickup_points, а это самая читаемая таблица: PostgREST перечитывает
-- схему после каждого DDL и берёт на неё свои блокировки. Без ограничения ожидания
-- запуск на живой базе встаёт в очередь и ловит deadlock; лучше быстро упасть и повторить.
set lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- Адрес пункта больше не спрашиваем: название и так пишут адресом («Ленина 12»).
-- Колонку оставляем — в ней данные старых точек, и отчёты на неё ещё смотрят.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pickup_points alter column address drop not null;
alter table public.pickup_points alter column address set default '';

-- ────────────────────────────────────────────────────────────────────────────
-- Групповой чат. Тот же telegram_chats: у группы нет сценария ввода расходов,
-- но есть та же привязка к боту и та же проверка «чат ещё жив».
-- ────────────────────────────────────────────────────────────────────────────
alter table public.telegram_chats add column if not exists chat_kind text not null default 'PRIVATE';
alter table public.telegram_chats drop constraint if exists telegram_chats_kind_check;
alter table public.telegram_chats add constraint telegram_chats_kind_check check (chat_kind in ('PRIVATE','GROUP'));
alter table public.telegram_chats add column if not exists title text;

-- Владелец отвязывает группу из приложения: на чтение политика уже есть, на запись не было.
drop policy if exists telegram_chats_owner_write on public.telegram_chats;
create policy telegram_chats_owner_write on public.telegram_chats
  for update to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
drop policy if exists telegram_chats_owner_delete on public.telegram_chats;
create policy telegram_chats_owner_delete on public.telegram_chats
  for delete to authenticated using(public.is_org_owner(organization_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Код привязки группы. Отдельный флаг, а не роль: код для группы нельзя погасить
-- в личном чате и наоборот — иначе посторонний в группе подписал бы её на сводки.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.telegram_pairing_codes add column if not exists for_group boolean not null default false;

create or replace function public.create_telegram_pairing_code(p_organization_id uuid, p_pickup_point_id uuid, p_employee_id uuid default null)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text; selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration from public.telegram_integrations
   where organization_id=p_organization_id and pickup_point_id=p_pickup_point_id and status='CONNECTED';
  if selected_integration is null then raise exception 'bot is not connected'; end if;
  new_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
  -- Гасим только личные коды: код группы живёт своей жизнью.
  delete from public.telegram_pairing_codes
   where organization_id=p_organization_id and user_id=auth.uid() and used_at is null and for_group=false
     and pickup_point_id is not distinct from p_pickup_point_id;
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,pickup_point_id,employee_id,role,code,for_group)
  values(p_organization_id,auth.uid(),selected_integration,p_pickup_point_id,p_employee_id,
         case when p_employee_id is null then 'OWNER'::public.member_role else 'EMPLOYEE'::public.member_role end,
         new_code,false);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid,uuid,uuid) to authenticated;

/** Код для привязки группы: его отправляют боту прямо в группе. */
create or replace function public.create_telegram_group_code(p_organization_id uuid, p_pickup_point_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text; selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration from public.telegram_integrations
   where organization_id=p_organization_id and pickup_point_id=p_pickup_point_id and status='CONNECTED';
  if selected_integration is null then raise exception 'bot is not connected'; end if;
  new_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
  delete from public.telegram_pairing_codes
   where organization_id=p_organization_id and user_id=auth.uid() and used_at is null and for_group
     and pickup_point_id is not distinct from p_pickup_point_id;
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,pickup_point_id,role,code,for_group)
  values(p_organization_id,auth.uid(),selected_integration,p_pickup_point_id,'OWNER'::public.member_role,new_code,true);
  return new_code;
end $$;
grant execute on function public.create_telegram_group_code(uuid,uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Что и когда бот присылает. Строка на бота: бот и так один на точку.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_bot_settings (
  integration_id uuid primary key references public.telegram_integrations on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  pickup_point_id uuid not null references public.pickup_points on delete cascade,

  -- «Сегодня дежурит»: утром в группу, чтобы смена не путалась, кто выходит.
  duty_today_enabled boolean not null default true,
  duty_today_time time not null default '08:30',

  -- «Завтра дежурит»: вечером, пока ещё можно найти замену.
  duty_tomorrow_enabled boolean not null default true,
  duty_tomorrow_time time not null default '20:00',

  -- Дырки в графике на горизонте: дни, где людей меньше, чем мест на смене.
  gaps_enabled boolean not null default true,
  gaps_time time not null default '10:00',
  gaps_horizon_days int not null default 14 check (gaps_horizon_days between 1 and 60),
  -- График закрыт — молчим. Ежедневное «всё хорошо» люди перестают читать,
  -- и вместе с ним перестают читать сообщение о настоящей дырке.
  gaps_quiet_when_full boolean not null default true,

  -- Расписание на неделю вперёд, одним сообщением в выбранный день.
  week_enabled boolean not null default false,
  week_time time not null default '18:00',
  week_weekday int not null default 6 check (week_weekday between 0 and 6),

  -- Напоминание внести расходы и приход за день.
  money_enabled boolean not null default false,
  money_time time not null default '21:00',

  updated_at timestamptz not null default now()
);
create index if not exists telegram_bot_settings_point_idx on public.telegram_bot_settings(pickup_point_id);

alter table public.telegram_bot_settings enable row level security;
drop policy if exists telegram_bot_settings_owner on public.telegram_bot_settings;
create policy telegram_bot_settings_owner on public.telegram_bot_settings
  for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

-- Настройки для уже подключённых ботов: без строки напоминания не включатся.
insert into public.telegram_bot_settings(integration_id, organization_id, pickup_point_id)
select i.id, i.organization_id, i.pickup_point_id
from public.telegram_integrations i
where i.pickup_point_id is not null
on conflict (integration_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- Журнал отправок. Планировщик просыпается чаще, чем наступает время напоминания,
-- поэтому «уже отправляли» — это запись здесь, а не надежда на точность крона.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_reminder_log (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.telegram_integrations on delete cascade,
  telegram_chat_id bigint not null,
  kind text not null,
  ref_date date not null,
  sent_at timestamptz not null default now()
);
create unique index if not exists telegram_reminder_log_once
  on public.telegram_reminder_log(integration_id, telegram_chat_id, kind, ref_date);

alter table public.telegram_reminder_log enable row level security;
revoke all on public.telegram_reminder_log from anon, authenticated;
grant select, insert, delete on public.telegram_reminder_log to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090022_group_only_bot.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Бот становится односторонним: только напоминания в группу.
--
-- Ввод расходов и удержаний сообщением боту, личные чаты владельца и кабинет сотрудника
-- в Telegram убраны — всё это делается в приложении, и второй интерфейс с собственными
-- правилами только расходился бы с ним.
--
-- Данные не удаляем: личные чаты отключаем, историю привязок и записанные через бота
-- расходы оставляем как есть.

-- Личные чаты больше не обслуживаются: бот на сообщения в них не отвечает.
update public.telegram_chats set active=false, updated_at=now()
where chat_kind <> 'GROUP' and active;

-- Личных кодов привязки больше никто не создаёт.
delete from public.telegram_pairing_codes where used_at is null and for_group=false;
drop function if exists public.create_telegram_pairing_code(uuid,uuid,uuid);
drop function if exists public.create_telegram_pairing_code(uuid);

-- ────────────────────────────────────────────────────────────────────────────
-- 202609090023_group_approval.sql
-- ────────────────────────────────────────────────────────────────────────────

-- Группа подключается кнопкой в приложении, а не кодом.
--
-- Telegram сам сообщает боту, в какой чат его добавили, поэтому код из приложения был
-- лишней работой руками. Подтверждение всё равно нужно: иначе любой, кто знает @имя бота,
-- добавил бы его в свой чат и начал получать график точки с именами сотрудников.
--
-- Теперь у чата два признака:
--   active      — бот сейчас состоит в этом чате;
--   approved_at — владелец подтвердил чат в приложении, туда можно слать.
-- Кандидат — active без approved_at: бот в группе, но молчит, пока его не подтвердили.
alter table public.telegram_chats add column if not exists approved_at timestamptz;

-- Уже привязанные кодом группы подтверждать заново не нужно.
update public.telegram_chats
set approved_at = coalesce(approved_at, created_at)
where chat_kind = 'GROUP' and active and approved_at is null;

-- Коды привязки больше не создаются ни для группы, ни для лички.
delete from public.telegram_pairing_codes where used_at is null;
drop function if exists public.create_telegram_group_code(uuid,uuid);

commit;
