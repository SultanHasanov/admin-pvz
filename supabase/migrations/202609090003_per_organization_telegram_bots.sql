alter table public.telegram_integrations
  add column if not exists bot_id bigint,
  add column if not exists bot_username text,
  add column if not exists connected_by uuid references auth.users on delete set null,
  add column if not exists connected_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_error text;

create table public.telegram_bot_secrets (
  integration_id uuid primary key references public.telegram_integrations on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  encrypted_bot_token text not null,
  webhook_secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_bot_secrets enable row level security;
revoke all on public.telegram_bot_secrets from anon, authenticated;

alter table public.telegram_chats add column if not exists integration_id uuid references public.telegram_integrations on delete cascade;
alter table public.telegram_pairing_codes add column if not exists integration_id uuid references public.telegram_integrations on delete cascade;

alter table public.telegram_chats drop constraint if exists telegram_chats_telegram_chat_id_key;
create unique index if not exists telegram_chats_integration_chat_key on public.telegram_chats(integration_id, telegram_chat_id);

create or replace function public.create_telegram_pairing_code(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare
  new_code text;
  selected_integration uuid;
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'forbidden'; end if;
  select id into selected_integration
  from public.telegram_integrations
  where organization_id=p_organization_id and status='CONNECTED';
  if selected_integration is null then raise exception 'Сначала подключите Telegram-бота'; end if;
  delete from public.telegram_pairing_codes where organization_id=p_organization_id and user_id=auth.uid() and used_at is null;
  new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.telegram_pairing_codes(organization_id,user_id,integration_id,code)
  values(p_organization_id,auth.uid(),selected_integration,new_code);
  return new_code;
end $$;
grant execute on function public.create_telegram_pairing_code(uuid) to authenticated;
