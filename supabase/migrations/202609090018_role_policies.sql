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
