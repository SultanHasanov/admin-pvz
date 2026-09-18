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
