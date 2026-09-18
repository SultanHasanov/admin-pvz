-- Места на смене: у точки задано, сколько человек должно выходить в день, а у смены —
-- какое из мест она занимает. Отсюда берутся «дырки в графике» и очередь на каждое место.

-- {"def":2} — два места каждый день; {"def":1,"wd":{"4":2,"5":2,"6":2}} — по одному,
-- но пт–вс по два. Ключи wd — дни недели от понедельника (0) до воскресенья (6).
alter table public.pickup_points add column if not exists slot_config jsonb not null default '{"def":1}'::jsonb;
alter table public.pickup_points drop constraint if exists pickup_points_slot_config_check;
alter table public.pickup_points add constraint pickup_points_slot_config_check
  check (jsonb_typeof(slot_config->'def')='number' and (slot_config->'def')::int between 1 and 8);

alter table public.shifts add column if not exists slot_index int not null default 0;
alter table public.shifts drop constraint if exists shifts_slot_index_check;
alter table public.shifts add constraint shifts_slot_index_check check (slot_index >= 0);

-- Календарный день смены отдельной колонкой. Выражение по planned_start в индекс не годится:
-- приведение timestamptz к дате зависит от часового пояса сессии и потому не immutable.
-- Считаем день в поясе самой точки — ночная смена с 21:00 остаётся днём своего начала.
alter table public.shifts add column if not exists work_date date;

create or replace function public.shifts_fill_slot()
returns trigger language plpgsql set search_path=public as $$
declare zone text; taken int[];
begin
  select coalesce(timezone,'Europe/Moscow') into zone from public.pickup_points where id=new.pickup_point_id;
  new.work_date := (new.planned_start at time zone coalesce(zone,'Europe/Moscow'))::date;

  -- Место занято другой сменой — отдаём ближайшее свободное. Так любой писатель (старый
  -- экран, бот, синхронизация WB) остаётся рабочим, не зная про места, а осознанный выбор
  -- места делает мастер графика.
  if new.status in ('PLANNED','ON_DUTY','COMPLETED') then
    select coalesce(array_agg(slot_index), '{}') into taken
    from public.shifts
    where pickup_point_id=new.pickup_point_id and work_date=new.work_date
      and status in ('PLANNED','ON_DUTY','COMPLETED') and id is distinct from new.id;
    while new.slot_index = any(taken) loop new.slot_index := new.slot_index + 1; end loop;
  end if;
  return new;
end $$;

drop trigger if exists shifts_fill_slot on public.shifts;
create trigger shifts_fill_slot before insert or update of planned_start,pickup_point_id,slot_index,status on public.shifts
for each row execute function public.shifts_fill_slot();

-- Бэкфилл: день берём так же, как тригер, а места нумеруем по порядку начала смены.
update public.shifts s
set work_date = (s.planned_start at time zone coalesce(p.timezone,'Europe/Moscow'))::date
from public.pickup_points p
where p.id = s.pickup_point_id and s.work_date is null;

with numbered as (
  select id, row_number() over (
    partition by pickup_point_id, work_date order by planned_start, employee_id
  ) - 1 as position
  from public.shifts
  where status in ('PLANNED','ON_DUTY','COMPLETED')
)
update public.shifts s set slot_index = n.position from numbered n where n.id = s.id and s.slot_index <> n.position;

alter table public.shifts alter column work_date set not null;

-- Одна смена на место в дне. До сих пор в shifts не было ни одного уникального ограничения,
-- и от дублей спасала только дедупликация в JS при применении графика.
create unique index if not exists shifts_point_date_slot_uq
  on public.shifts(pickup_point_id, work_date, slot_index)
  where status in ('PLANNED','ON_DUTY','COMPLETED');

create index if not exists shifts_point_date_idx on public.shifts(pickup_point_id, work_date);
