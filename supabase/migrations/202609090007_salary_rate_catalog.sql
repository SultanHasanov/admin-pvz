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
