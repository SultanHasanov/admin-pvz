create table public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid references auth.users on delete set null,
  telegram_chat_id bigint not null unique,
  telegram_user_id bigint not null,
  role public.member_role not null default 'OWNER',
  state jsonb not null default '{"step":"idle"}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index telegram_chats_org_idx on public.telegram_chats(organization_id);

create table public.telegram_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  code text not null unique check(code ~ '^[A-Z0-9]{8}$'),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_chats enable row level security;
alter table public.telegram_pairing_codes enable row level security;
create policy telegram_chats_owner_read on public.telegram_chats for select to authenticated using(public.is_org_owner(organization_id));
create policy telegram_pair_code_owner_all on public.telegram_pairing_codes for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id) and user_id=auth.uid());

create or replace function public.create_telegram_pairing_code(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  delete from public.telegram_pairing_codes where organization_id=p_organization_id and user_id=auth.uid() and used_at is null;
  new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.telegram_pairing_codes(organization_id,user_id,code) values(p_organization_id,auth.uid(),new_code);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid) to authenticated;
