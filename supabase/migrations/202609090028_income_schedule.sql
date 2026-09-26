-- Общий для организации график ввода доходов маркетплейса.
create table if not exists public.income_schedule_settings (
  organization_id uuid primary key references public.organizations on delete cascade,
  weekly_enabled boolean not null default true,
  custom_enabled boolean not null default false,
  custom_days int[] not null default array[10,25],
  updated_at timestamptz not null default now(),
  constraint income_schedule_mode check(weekly_enabled or custom_enabled),
  constraint income_schedule_days check(
    cardinality(custom_days) in (2,3)
    and custom_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]
  )
);

alter table public.income_schedule_settings enable row level security;
create policy org_select on public.income_schedule_settings for select to authenticated
  using(public.is_org_member(organization_id));
create policy org_write on public.income_schedule_settings for all to authenticated
  using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

insert into public.income_schedule_settings(organization_id)
select id from public.organizations on conflict(organization_id) do nothing;

create or replace function public.income_schedule_for_new_org()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.income_schedule_settings(organization_id) values(new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists organizations_income_schedule_defaults on public.organizations;
create trigger organizations_income_schedule_defaults after insert on public.organizations
for each row execute function public.income_schedule_for_new_org();
