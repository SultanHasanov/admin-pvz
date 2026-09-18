import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle, Label } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { ChoiceChips } from '../shared/kit/PickList'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { toastDone, toastError } from '../shared/kit/Toaster'
import { payModeTitles } from '../shared/salary'
import { dayLabel, monthLabel, monthStart, monthEnd, timeLabel, today, weekStartOf } from '../shared/dates'
import { keys } from '../services/queries'
import { listEmployees } from '../services/employees'
import { drawSchedule, shareSchedule, type ShareRow } from '../features/schedule/shareImage'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'

type Period = 'week' | 'month'

/**
 * График картинкой для сотрудников.
 *
 * Картинка, а не ссылка: у сотрудника может не быть приложения, а скриншот расписания
 * в чате — то, чем владельцы ПВЗ делятся и без нас. Отправляем системным «Поделиться»,
 * а где его нет — сохраняем файл.
 */
export default function Share() {
  const { month, pointId, points, defaultPointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const totals = useMonthTotals()
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })

  const active = points.filter(point => !point.archivedAt)
  const [target, setTarget] = useState(pointId || defaultPointId || active[0]?.id || '')
  const [period, setPeriod] = useState<Period>('week')
  const [busy, setBusy] = useState(false)

  const weekStart = weekStartOf(month === today().slice(0, 7) ? today() : monthStart(month))
  const range = period === 'week'
    ? { from: weekStart, to: dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD') }
    : { from: monthStart(month), to: dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD') }

  const nameOf = (id:string) => employees.data?.find(employee => employee.id === id)?.fullName ?? 'Сотрудник'

  const rows = useMemo<ShareRow[]>(() => totals.shifts
    .filter(shift => {
      const date = shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
      return shift.pickupPointId === target && date >= range.from && date <= range.to && shift.status !== 'REPLACED'
    })
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt))
    .map(shift => ({
      date: dayjs(shift.startsAt).format('D MMM, dd'),
      name: nameOf(shift.employeeId),
      time: `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`,
      note: shift.payMode === 'FULL' ? undefined : payModeTitles[shift.payMode],
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [totals.shifts, target, range.from, range.to, employees.data])

  const send = async () => {
    setBusy(true)
    try {
      const canvas = drawSchedule({
        title: pointName(target),
        subtitle: period === 'week' ? `График ${dayLabel(range.from)} — ${dayLabel(range.to)}` : `График · ${monthLabel(month)}`,
        rows,
        footer: `Всего смен: ${rows.length}. Изменения — в приложении «Пункт».`,
      })
      const outcome = await shareSchedule(canvas, `график-${target}-${range.from}.png`)
      toastDone(outcome === 'shared' ? 'Отправлено' : 'Картинка сохранена')
    } catch (error) {
      // Отмена системного окна «Поделиться» — это не ошибка, молчим.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toastError(error instanceof Error ? error.message : 'Не удалось собрать картинку')
      }
    } finally { setBusy(false) }
  }

  const header = <Header title="Поделиться" onBack={canBack ? back : undefined}/>
  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={4}/></Card></Screen>

  return <Screen
    header={header}
    footer={<Button block disabled={!rows.length || busy} onClick={() => void send()}>
      {rows.length ? `Отправить · ${rows.length} смен` : 'Нет смен за период'}
    </Button>}
  >
    {active.length > 1 && <>
      <Label>Пункт выдачи</Label>
      <div className="mt-[7px]">
        <ChoiceChips
          value={target}
          onPick={setTarget}
          options={active.map(item => ({ value: item.id, label: item.name.replace(/^ПВЗ\s+/, '') }))}
        />
      </div>
    </>}

    <SectionTitle>Период</SectionTitle>
    <ChoiceChips
      value={period}
      onPick={setPeriod}
      options={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: monthLabel(month).split(' ')[0] }]}
    />

    <SectionTitle count={rows.length}>Что отправим</SectionTitle>
    <Card>
      {rows.length === 0
        ? <EmptyState title="Смен за период нет" sub="Заполните график — тогда будет что отправлять"/>
        : <List>
          {rows.map((row, index) => <ListRow
            key={`${row.date}-${index}`}
            title={row.name}
            sub={row.date}
            right={row.time}
            rightSub={row.note}
            rightSubTone="warn"
          />)}
        </List>}
    </Card>

    <div className="mt-3 text-sub leading-[1.4] text-muted">
      Отправляется картинкой: сотруднику не нужно приложение, чтобы её открыть.
    </div>
  </Screen>
}
