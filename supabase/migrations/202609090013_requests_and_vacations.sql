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
