create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.create_organization_with_owner(
  p_name text, p_point_name text, p_point_address text,
  p_timezone text default 'Europe/Moscow'
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_point_name)) < 1 or length(trim(p_point_address)) < 1 then
    raise exception 'organization name, pickup point and address are required';
  end if;
  select organization_id into new_organization_id from public.organization_members
  where user_id = current_user_id limit 1;
  if new_organization_id is not null then return new_organization_id; end if;

  insert into public.organizations (name) values (trim(p_name)) returning id into new_organization_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'OWNER');
  insert into public.pickup_points (organization_id, name, address, timezone)
  values (new_organization_id, trim(p_point_name), trim(p_point_address), coalesce(nullif(trim(p_timezone), ''), 'Europe/Moscow'));
  insert into public.enabled_modules (organization_id, module)
  select new_organization_id, unnest(enum_range(null::public.module_key));
  insert into public.tax_settings (organization_id) values (new_organization_id);
  insert into public.subscriptions (organization_id, trial_ends_at)
  values (new_organization_id, now() + interval '14 days');
  insert into public.profiles (id, onboarding_completed) values (current_user_id, true)
  on conflict (id) do update set onboarding_completed = true, updated_at = now();
  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text, text) to authenticated;
