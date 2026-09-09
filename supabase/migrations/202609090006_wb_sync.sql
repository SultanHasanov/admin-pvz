begin;

alter table public.pickup_points add column if not exists wb_external_id bigint;
alter table public.employees add column if not exists wb_user_id bigint;
alter table public.wb_deductions add column if not exists wb_source text;
alter table public.wb_deductions add column if not exists wb_external_key text;

create unique index if not exists pickup_points_org_wb_external_uidx
  on public.pickup_points(organization_id, wb_external_id);
create unique index if not exists employees_org_wb_user_uidx
  on public.employees(organization_id, wb_user_id);
create unique index if not exists wb_deductions_org_source_key_uidx
  on public.wb_deductions(organization_id, wb_source, wb_external_key);

create table if not exists public.wb_integrations (
  organization_id uuid primary key references public.organizations on delete cascade,
  status text not null default 'NOT_CONNECTED'
    check (status in ('NOT_CONNECTED','AWAIT_CODE','CONNECTED','ERROR')),
  encrypted_session text,
  phone_hint text,
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wb_integrations enable row level security;
create policy wb_integrations_owner_select on public.wb_integrations
  for select to authenticated using (public.is_org_owner(organization_id));
revoke all on table public.wb_integrations from public, anon, authenticated;
grant select on table public.wb_integrations to authenticated;
grant select, insert, update, delete on table public.wb_integrations to service_role;

commit;
