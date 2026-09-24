-- С каким маркетплейсом работает пункт — от этого зависит, как вписывается доход.
--
-- WB платит каждый понедельник за прошлую неделю, Ozon — два раза в месяц, в окна
-- 10–15 и 20–25 числа. Приложение показывает у пункта его периоды выплат за месяц,
-- и на каждый период вписывается одна сумма: так выплаты не пересекаются и не
-- считаются дважды. Пункт работает с одним маркетплейсом; прежние пункты — WB.
set lock_timeout = '5s';

alter table public.pickup_points add column if not exists marketplace text not null default 'WB';

alter table public.pickup_points drop constraint if exists pickup_points_marketplace_check;
alter table public.pickup_points add constraint pickup_points_marketplace_check check (marketplace in ('WB','OZON'));
