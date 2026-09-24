-- Задания «Настройка пункта» для нового владельца: что уже сделано и скрыт ли список.
--
-- Прогресс не храним, а выводим из данных: задание «Добавить сотрудников» выполнено,
-- когда сотрудник есть, как бы его ни завели. Храним только одно — скрыл ли владелец список.
-- У организаций, созданных до этой миграции, список сразу скрыт: они давно настроены.
set lock_timeout = '5s';

alter table public.organizations add column if not exists setup_hidden_at timestamptz;
update public.organizations set setup_hidden_at = now() where setup_hidden_at is null;

create or replace function public.setup_progress()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members
  where user_id = auth.uid() and role = 'OWNER' limit 1;
  if org is null then return null; end if;

  return jsonb_build_object(
    'points', exists(select 1 from pickup_points where organization_id = org and archived_at is null),
    'employees', exists(select 1 from employees where organization_id = org and status = 'ACTIVE'),
    'default_rate', exists(select 1 from salary_rates where organization_id = org and is_default and archived_at is null),
    'shifts', exists(select 1 from shifts where organization_id = org),
    'income', exists(select 1 from income_entries where organization_id = org),
    'expense', exists(select 1 from expense_entries where organization_id = org)
      or exists(select 1 from recurring_expenses where organization_id = org),
    'hidden', (select setup_hidden_at is not null from organizations where id = org)
  );
end;
$$;

create or replace function public.set_setup_hidden(p_hidden boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members
  where user_id = auth.uid() and role = 'OWNER' limit 1;
  if org is null then raise exception 'only the owner can change setup'; end if;
  update organizations set setup_hidden_at = case when p_hidden then now() end where id = org;
end;
$$;

revoke all on function public.setup_progress(), public.set_setup_hidden(boolean) from public;
grant execute on function public.setup_progress(), public.set_setup_hidden(boolean) to authenticated;
