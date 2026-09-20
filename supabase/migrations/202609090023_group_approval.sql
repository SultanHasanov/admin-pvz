-- Группа подключается кнопкой в приложении, а не кодом.
--
-- Telegram сам сообщает боту, в какой чат его добавили, поэтому код из приложения был
-- лишней работой руками. Подтверждение всё равно нужно: иначе любой, кто знает @имя бота,
-- добавил бы его в свой чат и начал получать график точки с именами сотрудников.
--
-- Теперь у чата два признака:
--   active      — бот сейчас состоит в этом чате;
--   approved_at — владелец подтвердил чат в приложении, туда можно слать.
-- Кандидат — active без approved_at: бот в группе, но молчит, пока его не подтвердили.
alter table public.telegram_chats add column if not exists approved_at timestamptz;

-- Уже привязанные кодом группы подтверждать заново не нужно.
update public.telegram_chats
set approved_at = coalesce(approved_at, created_at)
where chat_kind = 'GROUP' and active and approved_at is null;

-- Коды привязки больше не создаются ни для группы, ни для лички.
delete from public.telegram_pairing_codes where used_at is null;
drop function if exists public.create_telegram_group_code(uuid,uuid);
