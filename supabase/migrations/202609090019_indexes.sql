-- Индексы под запросы новых экранов. Все — по organization_id первым полем: RLS всё равно
-- фильтрует по организации, и без него индекс не используется.

-- Сетка графика за месяц по одной точке.
create index if not exists shifts_org_point_start_idx on public.shifts(organization_id, pickup_point_id, planned_start);
-- «Мои смены» у сотрудника.
create index if not exists shifts_employee_date_idx on public.shifts(employee_id, work_date);
-- Колокольчик владельца: открытые заявки и новые удержания.
create index if not exists wb_deductions_status_idx on public.wb_deductions(organization_id, status, created_at desc);
-- Ведомость за месяц.
create index if not exists salary_payments_month_idx on public.salary_payments(organization_id, accrual_month);
create index if not exists bonuses_month_idx on public.bonuses(organization_id, date);
create index if not exists penalties_month_idx on public.employee_penalties(organization_id, date);
-- Доходы и расходы месяца на экране «Деньги».
create index if not exists income_month_idx on public.income_entries(organization_id, date);
create index if not exists expense_month_idx on public.expense_entries(organization_id, date);
