-- Ставка по умолчанию подставляется новому сотруднику: у большинства она одна на всех.
alter table public.salary_rates add column if not exists is_default boolean not null default false;
-- По умолчанию может быть только одна ставка на организацию.
create unique index if not exists salary_rates_default_idx on public.salary_rates(organization_id) where is_default;
