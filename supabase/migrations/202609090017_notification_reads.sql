-- Лента уведомлений собирается на клиенте из того, что уже есть в базе: открытые заявки,
-- новые удержания, дырки в графике, неподтверждённые регулярные расходы, сроки выплат.
-- Материализовать её значило бы завести пять триггеров и ловить рассинхрон, поэтому
-- в базе храним только одно, чего из данных не вывести, — что пользователь это уже видел.

create table if not exists public.notification_reads (
  user_id uuid not null references auth.users on delete cascade,
  -- Вид события: request, deduction, hole, recurring, payout.
  kind text not null,
  -- Ссылка на источник: id строки или синтетический ключ вида 'p1|2026-09-19' для дырки.
  ref_id text not null,
  read_at timestamptz not null default now(),
  primary key(user_id, kind, ref_id)
);

alter table public.notification_reads enable row level security;
create policy notification_reads_own on public.notification_reads for all to authenticated
  using(user_id = auth.uid()) with check(user_id = auth.uid());
