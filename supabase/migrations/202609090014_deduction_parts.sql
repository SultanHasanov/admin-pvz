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
