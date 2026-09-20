-- Напоминания бота в рабочую группу точки.
--
-- До сих пор бот только принимал сообщения. Теперь у каждого бота (а он привязан к одному
-- ПВЗ) есть чат-получатель — группа, куда по расписанию уходят дежурство на сегодня,
-- дежурство на завтра, дырки в графике и напоминание внести расходы.
--
-- Время хранится как `time` без пояса и считается местным временем точки: владелец задаёт
-- «в 8:30», и это 8:30 у этого ПВЗ, а не в UTC.

-- Миграция меняет pickup_points, а это самая читаемая таблица: PostgREST перечитывает
-- схему после каждого DDL и берёт на неё свои блокировки. Без ограничения ожидания
-- запуск на живой базе встаёт в очередь и ловит deadlock; лучше быстро упасть и повторить.
set lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- Адрес пункта больше не спрашиваем: название и так пишут адресом («Ленина 12»).
-- Колонку оставляем — в ней данные старых точек, и отчёты на неё ещё смотрят.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pickup_points alter column address drop not null;
alter table public.pickup_points alter column address set default '';

-- ────────────────────────────────────────────────────────────────────────────
-- Групповой чат. Тот же telegram_chats: у группы нет сценария ввода расходов,
-- но есть та же привязка к боту и та же проверка «чат ещё жив».
-- ────────────────────────────────────────────────────────────────────────────
alter table public.telegram_chats add column if not exists chat_kind text not null default 'PRIVATE';
alter table public.telegram_chats drop constraint if exists telegram_chats_kind_check;
alter table public.telegram_chats add constraint telegram_chats_kind_check check (chat_kind in ('PRIVATE','GROUP'));
alter table public.telegram_chats add column if not exists title text;

-- Владелец отвязывает группу из приложения: на чтение политика уже есть, на запись не было.
drop policy if exists telegram_chats_owner_write on public.telegram_chats;
create policy telegram_chats_owner_write on public.telegram_chats
  for update to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
drop policy if exists telegram_chats_owner_delete on public.telegram_chats;
create policy telegram_chats_owner_delete on public.telegram_chats
  for delete to authenticated using(public.is_org_owner(organization_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Код привязки группы. Отдельный флаг, а не роль: код для группы нельзя погасить
-- в личном чате и наоборот — иначе посторонний в группе подписал бы её на сводки.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.telegram_pairing_codes add column if not exists for_group boolean not null default false;

create or replace function public.create_telegram_pairing_code(p_organization_id uuid, p_pickup_point_id uuid, p_employee_id uuid default null)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text; selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration from public.telegram_integrations
   where organization_id=p_organization_id and pickup_point_id=p_pickup_point_id and status='CONNECTED';
  if selected_integration is null then raise exception 'bot is not connected'; end if;
  new_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
  -- Гасим только личные коды: код группы живёт своей жизнью.
  delete from public.telegram_pairing_codes
   where organization_id=p_organization_id and user_id=auth.uid() and used_at is null and for_group=false
     and pickup_point_id is not distinct from p_pickup_point_id;
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,pickup_point_id,employee_id,role,code,for_group)
  values(p_organization_id,auth.uid(),selected_integration,p_pickup_point_id,p_employee_id,
         case when p_employee_id is null then 'OWNER'::public.member_role else 'EMPLOYEE'::public.member_role end,
         new_code,false);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid,uuid,uuid) to authenticated;

/** Код для привязки группы: его отправляют боту прямо в группе. */
create or replace function public.create_telegram_group_code(p_organization_id uuid, p_pickup_point_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text; selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration from public.telegram_integrations
   where organization_id=p_organization_id and pickup_point_id=p_pickup_point_id and status='CONNECTED';
  if selected_integration is null then raise exception 'bot is not connected'; end if;
  new_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
  delete from public.telegram_pairing_codes
   where organization_id=p_organization_id and user_id=auth.uid() and used_at is null and for_group
     and pickup_point_id is not distinct from p_pickup_point_id;
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,pickup_point_id,role,code,for_group)
  values(p_organization_id,auth.uid(),selected_integration,p_pickup_point_id,'OWNER'::public.member_role,new_code,true);
  return new_code;
end $$;
grant execute on function public.create_telegram_group_code(uuid,uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Что и когда бот присылает. Строка на бота: бот и так один на точку.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_bot_settings (
  integration_id uuid primary key references public.telegram_integrations on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  pickup_point_id uuid not null references public.pickup_points on delete cascade,

  -- «Сегодня дежурит»: утром в группу, чтобы смена не путалась, кто выходит.
  duty_today_enabled boolean not null default true,
  duty_today_time time not null default '08:30',

  -- «Завтра дежурит»: вечером, пока ещё можно найти замену.
  duty_tomorrow_enabled boolean not null default true,
  duty_tomorrow_time time not null default '20:00',

  -- Дырки в графике на горизонте: дни, где людей меньше, чем мест на смене.
  gaps_enabled boolean not null default true,
  gaps_time time not null default '10:00',
  gaps_horizon_days int not null default 14 check (gaps_horizon_days between 1 and 60),
  -- График закрыт — молчим. Ежедневное «всё хорошо» люди перестают читать,
  -- и вместе с ним перестают читать сообщение о настоящей дырке.
  gaps_quiet_when_full boolean not null default true,

  -- Расписание на неделю вперёд, одним сообщением в выбранный день.
  week_enabled boolean not null default false,
  week_time time not null default '18:00',
  week_weekday int not null default 6 check (week_weekday between 0 and 6),

  -- Напоминание внести расходы и приход за день.
  money_enabled boolean not null default false,
  money_time time not null default '21:00',

  updated_at timestamptz not null default now()
);
create index if not exists telegram_bot_settings_point_idx on public.telegram_bot_settings(pickup_point_id);

alter table public.telegram_bot_settings enable row level security;
drop policy if exists telegram_bot_settings_owner on public.telegram_bot_settings;
create policy telegram_bot_settings_owner on public.telegram_bot_settings
  for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

-- Настройки для уже подключённых ботов: без строки напоминания не включатся.
insert into public.telegram_bot_settings(integration_id, organization_id, pickup_point_id)
select i.id, i.organization_id, i.pickup_point_id
from public.telegram_integrations i
where i.pickup_point_id is not null
on conflict (integration_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- Журнал отправок. Планировщик просыпается чаще, чем наступает время напоминания,
-- поэтому «уже отправляли» — это запись здесь, а не надежда на точность крона.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_reminder_log (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.telegram_integrations on delete cascade,
  telegram_chat_id bigint not null,
  kind text not null,
  ref_date date not null,
  sent_at timestamptz not null default now()
);
create unique index if not exists telegram_reminder_log_once
  on public.telegram_reminder_log(integration_id, telegram_chat_id, kind, ref_date);

alter table public.telegram_reminder_log enable row level security;
revoke all on public.telegram_reminder_log from anon, authenticated;
grant select, insert, delete on public.telegram_reminder_log to service_role;
