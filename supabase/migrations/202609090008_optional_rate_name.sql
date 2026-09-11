-- Название ставки нужно, только когда ставок одного типа несколько.
-- Обычной ставке хватает типа и суммы, поэтому имя становится необязательной пометкой.
alter table public.salary_rates drop constraint if exists salary_rates_name_check;
alter table public.salary_rates alter column name drop not null;
update public.salary_rates set name = null where length(trim(coalesce(name, ''))) = 0;
alter table public.salary_rates add constraint salary_rates_name_check check(name is null or length(trim(name)) > 0);

-- Две ставки одного типа с одинаковой суммой различить нечем — не даём их завести.
create unique index if not exists salary_rates_amount_idx on public.salary_rates(organization_id, payment_type, rate_kopecks);
