-- Постоянные расходы вместо регулярных с подтверждением.
--
-- Раньше регулярный расход каждый месяц ждал «Оплачено» и только тогда становился операцией.
-- Теперь он сам входит в расходы каждого месяца — аренда, камеры, уборка. Подтверждать нечего.
--
-- Сумма со временем меняется, а прошлые месяцы должны остаться как были. Поэтому у строки
-- есть срок действия:
--   start_month — первый месяц ('YYYY-MM'); null — с самого начала, то есть и в прошлых;
--   end_month   — последний месяц; null — без конца.
-- Правка суммы закрывает старую строку прошлым месяцем и заводит новую с текущего.
--
-- pickup_point_id уже допускает null: такой расход общий на все ПВЗ.
-- day_of_month больше не спрашиваем, но колонка NOT NULL — приложение пишет 1.
-- Таблица recurring_expense_occurrences остаётся как история прежних «Оплачено».
set lock_timeout = '5s';

alter table public.recurring_expenses add column if not exists start_month text;
alter table public.recurring_expenses add column if not exists end_month text;

alter table public.recurring_expenses drop constraint if exists recurring_expenses_months_check;
alter table public.recurring_expenses add constraint recurring_expenses_months_check check (
  (start_month is null or start_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
  and (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
  and (start_month is null or end_month is null or start_month <= end_month)
);
