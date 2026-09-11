-- Сохранённый график («Основной 2/2») применяется повторно в два клика.
-- Таблица shift_templates была заведена под одного сотрудника и ни разу не использовалась,
-- поэтому расширяем её до ротации: участников в графике может быть несколько.
alter table public.shift_templates add column if not exists name text;
alter table public.shift_templates add column if not exists employee_ids uuid[] not null default '{}';
alter table public.shift_templates add column if not exists pay_mode text not null default 'FULL';
alter table public.shift_templates add column if not exists updated_at timestamptz not null default now();
alter table public.shift_templates alter column employee_id drop not null;
alter table public.shift_templates alter column pickup_point_id drop not null;

-- Если строки в старой форме всё же появились, переносим их, а не теряем.
update public.shift_templates set employee_ids = array[employee_id]
 where employee_id is not null and employee_ids = '{}';
update public.shift_templates set name = 'График'
 where name is null or length(trim(name)) = 0;

alter table public.shift_templates alter column name set not null;

do $$ begin
  alter table public.shift_templates add constraint shift_templates_name_check check(length(trim(name)) > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shift_templates add constraint shift_templates_pay_mode_check check(pay_mode in ('FULL','HALF','HOURS'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shift_templates add constraint shift_templates_name_unique unique(organization_id, name);
exception when duplicate_object then null; end $$;

create index if not exists shift_templates_org_idx on public.shift_templates(organization_id, active);

-- Политики пересоздаём, чтобы свежая база и уже развёрнутая сошлись в одном состоянии.
alter table public.shift_templates enable row level security;
drop policy if exists org_select on public.shift_templates;
drop policy if exists org_write on public.shift_templates;
create policy org_select on public.shift_templates for select to authenticated using (public.is_org_member(organization_id));
create policy org_write on public.shift_templates for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
