import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import type { Shift } from '../../entities/types'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card, StatTile, StatTiles } from '../../shared/kit/Card'
import { List, ListRow, Pill } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { Fab } from '../../shared/kit/TabBar'
import { c } from '../../shared/kit/tokens'
import { rubles } from '../../shared/money'
import { plural } from '../../shared/format'
import { dayLabel, monthLabel, timeLabel, today as todayDate } from '../../shared/dates'
import { keys, scope } from '../../services/queries'
import { getPayoutSettings } from '../../services/payoutSettings'
import { endMyShift, startMyShift } from '../../services/shifts'
import { badgeOf } from '../../entities/notifications'
import { useWrite } from '../../features/write'
import { useMyMonth, useMyUpcoming } from '../../features/me/useMyMonth'
import { useMyFeed } from '../../features/me/useMyFeed'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'
import { NotLinked } from './NotLinked'

/**
 * Главная сотрудника: когда и где следующая смена, сколько заработано и что впереди.
 *
 * Первым делом — следующая смена: ради этого приложение и открывают. Здесь же её можно
 * начать и закрыть (только через RPC — сотрудник не правит смену напрямую) и сообщить,
 * что не сможет выйти.
 */
export default function MeHome() {
  const month = todayDate().slice(0, 7)
  const { pointName } = useOrg()
  const { setTab } = useNav()
  const { open } = useSheets()
  const my = useMyMonth(month)
  const next = useMyUpcoming()
  const feed = useMyFeed()
  const payout = useQuery({ queryKey: keys.payoutSettings, queryFn: getPayoutSettings })

  const today = todayDate()
  const shift = next.upcoming[0]
  const partners = shift ? next.partners(shift) : []
  const worked = my.sheet?.shifts ?? 0

  const start = useWrite({
    run: (id:string) => startMyShift(id),
    invalidate: [scope.shifts],
    done: 'Смена начата',
  })
  const end = useWrite({
    run: (id:string) => endMyShift(id),
    invalidate: [scope.shifts],
    done: 'Смена закрыта',
  })

  const cantWork = (row:Shift) => open('cantWork', { date: row.workDate ?? dayjs(row.startsAt).format('YYYY-MM-DD'), pointId: row.pickupPointId })

  const payday = payout.data?.payday
  const header = <Header title="Главная" bell={{ count: badgeOf(feed.unread.length), onClick: () => open('notifs') }}/>

  if (!my.loading && !my.employeeId) return <Screen header={header}><NotLinked/></Screen>

  return <Screen header={header}>
    {my.error && <div className="mb-3"><ErrorNote error={my.error}/></div>}

    <div className="rounded-xl bg-ink p-[17px] text-white">
      <div className="lbl text-white/55">Следующая смена</div>
      {next.loading
        ? <div className="my-2 h-8 w-40 animate-pulse rounded-sm bg-white/10"/>
        : <>
          <div className="mt-[5px] mb-[3px] text-date font-semibold tracking-[-0.025em]">
            {shift ? `${dayLabel(shift.startsAt)}${(shift.workDate ?? shift.startsAt.slice(0, 10)) === today ? ' · сегодня' : ''}` : 'Смен нет'}
          </div>
          <div className="text-row text-white/72">
            {shift
              ? `${pointName(shift.pickupPointId)} · ${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}${partners.length ? ` · вместе с: ${partners.join(', ')}` : ' · один на смене'}`
              : 'График на месяц ещё не заполнен'}
          </div>
        </>}

      {shift && shift.status === 'ON_DUTY' && <button
        type="button"
        className="tap mt-[14px] w-full rounded-[12px] bg-white py-[13px] text-center text-row font-semibold text-ink"
        disabled={end.isPending}
        onClick={() => end.mutate(shift.id)}
      >Завершить смену</button>}

      {shift && shift.status === 'PLANNED' && (shift.workDate ?? shift.startsAt.slice(0, 10)) === today && <button
        type="button"
        className="tap mt-[14px] w-full rounded-[12px] bg-white py-[13px] text-center text-row font-semibold text-ink"
        disabled={start.isPending}
        onClick={() => start.mutate(shift.id)}
      >Начать смену</button>}

      {shift && shift.status === 'PLANNED' && <button
        type="button"
        className="tap mt-2 w-full rounded-[12px] bg-white/14 py-[13px] text-center text-row font-semibold"
        onClick={() => cantWork(shift)}
      >Не смогу выйти</button>}
    </div>

    <div className="mt-[11px]">
      <StatTiles>
        <StatTile
          label="Заработано"
          value={rubles(my.sheet?.accrued ?? 0)}
          sub={`${worked} ${plural(worked, 'смена', 'смены', 'смен')}`}
          onClick={() => setTab('money')}
        />
        <StatTile
          label="К выплате"
          value={rubles(Math.max(0, my.sheet?.balance ?? 0))}
          sub="после вычетов"
          color={c.accent}
          onClick={() => setTab('money')}
        />
        <StatTile
          label="Прогноз месяца"
          value={rubles(my.forecast)}
          sub="если график не изменится"
          onClick={() => setTab('money')}
        />
        <StatTile
          label="Ближайшая выплата"
          value={payday ? dayjs(`${month}-01`).add(1, 'month').date(payday).format('D MMM').replace('.', '') : '—'}
          sub={`остаток за ${monthLabel(month).split(' ')[0].toLowerCase()}`}
          onClick={() => setTab('money')}
        />
      </StatTiles>
    </div>

    <SectionTitle>Ближайшие смены</SectionTitle>
    <Card>
      {next.loading
        ? <SkeletonRows rows={3}/>
        : !next.upcoming.length
          ? <EmptyState title="Смен пока нет" sub="Когда владелец поставит вас в график, смены появятся здесь"/>
          : <List>
            {next.upcoming.slice(0, 5).map(row => {
              const with_ = next.partners(row)
              return <ListRow
                key={row.id}
                leading={<div className="w-[52px] flex-none text-row font-semibold tabular-nums">{dayLabel(row.startsAt)}</div>}
                title={pointName(row.pickupPointId)}
                sub={`${timeLabel(row.startsAt)}–${timeLabel(row.endsAt)}${with_.length ? ` · вместе с: ${with_.join(', ')}` : ''}`}
                right={<Pill tone={row.status === 'ON_DUTY' ? 'ok' : 'accent'}>
                  {row.status === 'ON_DUTY' ? 'идёт' : row.payMode === 'HALF' ? '½ смены' : 'смена'}
                </Pill>}
                align="start"
                onClick={row.status === 'PLANNED' ? () => cantWork(row) : undefined}
              />
            })}
          </List>}
    </Card>

    <Fab label="Запросить выходной или отпуск" onClick={() => open('reqVac')}/>
  </Screen>
}
