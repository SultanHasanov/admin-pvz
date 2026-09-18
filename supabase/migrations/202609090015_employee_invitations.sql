-- Приглашение сотрудника в приложение: код вида ABC-D3F и ссылка /join/ABC-D3F.

create table if not exists public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  code text not null unique check(code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  status text not null default 'SENT' check(status in ('SENT','ACCEPTED','REVOKED')),
  created_by uuid references auth.users on delete set null,
  accepted_by uuid references auth.users on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
-- Одно живое приглашение на сотрудника: иначе по организации ходит несколько рабочих кодов.
create unique index if not exists employee_invitations_active_uq
  on public.employee_invitations(employee_id) where status='SENT';

alter table public.employee_invitations enable row level security;
-- Читает только владелец: код короткий, и select по нему для всех авторизованных
-- означал бы перебор. Приём идёт исключительно через RPC ниже.
create policy invitations_owner on public.employee_invitations for all to authenticated
  using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

-- Неудачные попытки приёма: защита от перебора кодов.
create table if not exists public.invitation_attempts (
  user_id uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invitation_attempts_idx on public.invitation_attempts(user_id, attempted_at desc);
alter table public.invitation_attempts enable row level security;
revoke all on public.invitation_attempts from anon, authenticated;

/** Код без похожих друг на друга символов: 0/O и 1/I на бумажке не различить. */
create or replace function public.generate_invitation_code()
returns text language plpgsql set search_path=public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    if i = 3 then result := result || '-'; end if;
  end loop;
  return result;
end $$;

/** Создать (или перевыпустить) приглашение сотруднику. Старое живое отзывается. */
create or replace function public.create_employee_invitation(p_employee_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare org uuid; new_code text;
begin
  select organization_id into org from public.employees where id=p_employee_id;
  if org is null or not public.is_org_owner(org) then raise exception 'forbidden'; end if;

  update public.employee_invitations set status='REVOKED' where employee_id=p_employee_id and status='SENT';

  loop
    new_code := public.generate_invitation_code();
    exit when not exists(select 1 from public.employee_invitations where code=new_code);
  end loop;

  insert into public.employee_invitations(organization_id,employee_id,code,created_by)
  values(org,p_employee_id,new_code,auth.uid());
  return new_code;
end $$;
grant execute on function public.create_employee_invitation(uuid) to authenticated;

/**
 * Принять приглашение: связывает вошедшего пользователя с карточкой сотрудника.
 * Возвращает организацию и сотрудника, чтобы приложение сразу открыло нужный экран.
 *
 * Неверный код — не исключение, а ответ `{ error }`. Исключение откатило бы транзакцию
 * вместе с записью о неудачной попытке, и ограничение на перебор никогда бы не сработало.
 */
create or replace function public.accept_employee_invitation(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation public.employee_invitations; failures int;
begin
  if auth.uid() is null then raise exception 'Нужно войти в приложение'; end if;

  -- Не больше десяти неудачных попыток в час на пользователя.
  select count(*) into failures from public.invitation_attempts
  where user_id=auth.uid() and attempted_at > now() - interval '1 hour';
  if failures >= 10 then
    return jsonb_build_object('error', 'Слишком много попыток, попробуйте через час');
  end if;

  select * into invitation from public.employee_invitations
  where code=upper(trim(p_code)) and status='SENT' and expires_at > now() for update;

  if invitation.id is null then
    insert into public.invitation_attempts(user_id) values(auth.uid());
    return jsonb_build_object('error', 'Код не найден или устарел');
  end if;

  insert into public.organization_members(organization_id,user_id,employee_id,role)
  values(invitation.organization_id, auth.uid(), invitation.employee_id, 'EMPLOYEE')
  on conflict(organization_id,user_id) do update set employee_id=excluded.employee_id;

  update public.employee_invitations
  set status='ACCEPTED', accepted_by=auth.uid(), accepted_at=now()
  where id=invitation.id;

  delete from public.invitation_attempts where user_id=auth.uid();

  return jsonb_build_object('organizationId', invitation.organization_id, 'employeeId', invitation.employee_id);
end $$;
grant execute on function public.accept_employee_invitation(text) to authenticated;
