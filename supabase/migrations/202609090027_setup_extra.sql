-- Дополнительные задания «Настройки пункта»: пригласить сотрудника в приложение, указать налог,
-- задать дни выплат, подключить Telegram. На «готово» они не влияют — это советы, а не шаги.
--
-- Строки tax_settings и payout_settings создаются сами вместе с организацией, со значениями
-- по умолчанию, поэтому «задано» — это сохранение позже регистрации (updated_at), а у налога
-- ещё и включённый расчёт.
set lock_timeout = '5s';

create or replace function public.setup_progress()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  org uuid;
  born timestamptz;
begin
  select organization_id into org from public.organization_members
  where user_id = auth.uid() and role = 'OWNER' limit 1;
  if org is null then return null; end if;
  select created_at + interval '1 minute' into born from organizations where id = org;

  return jsonb_build_object(
    'points', exists(select 1 from pickup_points where organization_id = org and archived_at is null),
    'employees', exists(select 1 from employees where organization_id = org and status = 'ACTIVE'),
    'default_rate', exists(select 1 from salary_rates where organization_id = org and is_default and archived_at is null),
    'shifts', exists(select 1 from shifts where organization_id = org),
    'income', exists(select 1 from income_entries where organization_id = org),
    'expense', exists(select 1 from expense_entries where organization_id = org)
      or exists(select 1 from recurring_expenses where organization_id = org),
    'invite', exists(select 1 from employee_invitations where organization_id = org and status in ('SENT', 'ACCEPTED')),
    'tax', exists(select 1 from tax_settings where organization_id = org and (enabled or updated_at > born)),
    'pay_days', exists(select 1 from payout_settings where organization_id = org and updated_at > born),
    'telegram', exists(select 1 from telegram_chats where organization_id = org and active and approved_at is not null),
    'hidden', (select setup_hidden_at is not null from organizations where id = org)
  );
end;
$$;

revoke all on function public.setup_progress() from public;
grant execute on function public.setup_progress() to authenticated;
