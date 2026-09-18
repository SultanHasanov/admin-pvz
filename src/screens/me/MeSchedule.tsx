import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Dot, List, ListRow } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { Segmented } from '../../shared/kit/Segmented'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { MonthCalendar, type CalendarDay } from '../../shared/kit/MonthCalendar'
import { Fab } from '../../shared/kit/TabBar'
import { toastDone } from '../../shared/kit/Toaster'
import type { Tone } from '../../shared/kit/tokens'
import { isAbsent } from '../../entities/slots'
import { rubles } from '../../shared/money'
import { dayLabel, monthLabel, timeLabel, today as todayDate } from '../../shared/dates'
import { useMyMonth } from '../../features/me/useMyMonth'
import { useOrg } from '../../app/OrgContext'
import { useSheets } from '../../app/sheets'
import { NotLinked } from './NotLinked'

const LEGEND:{ tone:Tone; label:string }[] = [
  { tone: 'neutral', label: 'Отработано' },
  { tone: 'accent', label: 'Смена' },
  { tone: 'info', label: 'Отпуск' },
]

/** «ПВЗ Ленина 12» → «Лени»: в клетке календаря помещается четыре буквы. */
const cellLabel = (name:string) => name.replace(/^ПВЗ\s+/, '').split(' ')[0].slice(0, 4)

/**
 * Мой график: этот месяц и следующий, как в прототипе. Дальше вперёд графика обычно
 * ещё нет, а прошлые месяцы сотруднику нужны только ради денег — они в «Деньгах».
 */
export default function MeSchedule() {
  const { pointName } = useOrg()
  const { open } = useSheets()
  const today = todayDate()
  const current = today.slice(0, 7)
  const nextMonth = dayjs(`${current}-01`).add(1, 'month').format('YYYY-MM')
  const [month, setMonth] = useState(current)
  const my = useMyMonth(month)

  const dateOf = (startsAt:string, workDate?:string) => workDate ?? dayjs(startsAt).format('YYYY-MM-DD')

  const days = useMemo(() => {
    const result = new Map<string, CalendarDay>()
    for (const shift of my.shifts) {
      const date = dateOf(shift.startsAt, shift.workDate)
      const vacation = isAbsent(my.absences, shift.employeeId, date)
      const done = shift.status === 'COMPLETED' || date < today
      result.set(date, {
        date,
        tone: vacation ? 'info' : done ? 'neutral' : 'accent',
        lines: [vacation ? 'отп' : shift.payMode === 'HALF' ? '½' : cellLabel(pointName(shift.pickupPointId))],
      })
    }
    return result
  }, [my.shifts, my.absences, today, pointName])

  const header = <Header title="Мой график"/>
  if (!my.loading && !my.employeeId) return <Screen header={header}><NotLinked/></Screen>

  return <Screen header={header}>
    <Segmented
      className="mb-3"
      value={month}
      onChange={setMonth}
      options={[current, nextMonth].map(value => ({ value, label: monthLabel(value).split(' ')[0] }))}
    />

    {my.error && <div className="mb-3"><ErrorNote error={my.error}/></div>}

    {my.loading
      ? <Card><SkeletonRows rows={5}/></Card>
      : <MonthCalendar month={month} days={days}/>}

    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {LEGEND.map(item => <div key={item.label} className="flex items-center gap-1.5 text-sub text-muted">
        <Dot tone={item.tone}/>{item.label}
      </div>)}
    </div>

    <SectionTitle count={my.shifts.length}>Мои смены · {monthLabel(month).split(' ')[0].toLowerCase()}</SectionTitle>
    <Card>
      {!my.loading && !my.shifts.length
        ? <EmptyState title="Смен в этом месяце нет" sub="Когда владелец составит график, он появится здесь"/>
        : <List>
          {my.shifts.map(shift => {
            const date = dateOf(shift.startsAt, shift.workDate)
            const worked = shift.status === 'COMPLETED'
            const partners = my.partners(shift)
            const pay = my.payOf(worked ? shift : { ...shift, status: 'COMPLETED' })
            return <ListRow
              key={shift.id}
              leading={<div className="w-[52px] flex-none text-row font-semibold tabular-nums">{dayLabel(shift.startsAt)}</div>}
              title={pointName(shift.pickupPointId)}
              sub={[
                `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`,
                shift.payMode === 'HALF' ? '½ смены' : shift.payMode === 'HOURS' ? 'по часам' : null,
                partners.length ? `с ${partners.join(', ')}` : null,
              ].filter(Boolean).join(' · ')}
              right={<span className={worked ? undefined : 'text-muted-soft'}>{rubles(pay)}</span>}
              align="start"
              onClick={date >= today && shift.status === 'PLANNED'
                ? () => open('cantWork', { date, pointId: shift.pickupPointId })
                : () => toastDone(`${worked ? 'Отработано' : 'Смена'} · ${rubles(pay)}`)}
            />
          })}
        </List>}
    </Card>

    <Fab label="Запросить выходной или отпуск" onClick={() => open('reqVac')}/>
  </Screen>
}
