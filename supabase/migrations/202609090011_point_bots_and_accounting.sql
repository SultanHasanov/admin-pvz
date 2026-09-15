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
