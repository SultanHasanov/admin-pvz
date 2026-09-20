-- Бот становится односторонним: только напоминания в группу.
--
-- Ввод расходов и удержаний сообщением боту, личные чаты владельца и кабинет сотрудника
-- в Telegram убраны — всё это делается в приложении, и второй интерфейс с собственными
-- правилами только расходился бы с ним.
--
-- Данные не удаляем: личные чаты отключаем, историю привязок и записанные через бота
-- расходы оставляем как есть.

-- Личные чаты больше не обслуживаются: бот на сообщения в них не отвечает.
update public.telegram_chats set active=false, updated_at=now()
where chat_kind <> 'GROUP' and active;

-- Личных кодов привязки больше никто не создаёт.
delete from public.telegram_pairing_codes where used_at is null and for_group=false;
drop function if exists public.create_telegram_pairing_code(uuid,uuid,uuid);
drop function if exists public.create_telegram_pairing_code(uuid);
