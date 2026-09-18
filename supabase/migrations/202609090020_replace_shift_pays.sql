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
