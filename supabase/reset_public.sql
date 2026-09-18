-- ============================================================================
-- СБРОС БАЗЫ: удаляет все таблицы, функции и данные приложения в схеме public.
-- НЕОБРАТИМО. Выполнять отдельно, ПЕРЕД full_schema.sql.
--
-- Аккаунты (auth.users) не трогает: удалить их — Authentication → Users.
-- ============================================================================

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
