import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle, Label } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { ChoiceChips } from '../shared/kit/PickList'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { toastDone, toastWarn } from '../shared/kit/Toaster'
import { generateCells, planCells } from '../entities/slots'
import { monthEnd, monthStart, dayLabel, monthLabel, weekStartOf, today } from '../shared/dates'
import { keys } from '../services/queries'
import { listScheduleTemplates, slotPlansOf, type ScheduleTemplate } from '../services/scheduleTemplates'
import { applyCells } from '../services/schedule'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

type Period = 'week' | 'fourWeeks' | 'month'

/**
 * Сохранённые графики. Выбор шаблона — это выбор правил; точка и период задаются здесь,
 * поэтому один шаблон применяется к любому месяцу и любой точке.
 */
export default function Templates() {
  const { month, pointId, points, defaultPointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()

  const active = points.filter(point => !point.archivedAt)
  const [target, setTarget] = useState(pointId || defaultPointId || active[0]?.id || '')
  const [period, setPeriod] = useState<Period>('month')
  const [chosen, setChosen] = useState<ScheduleTemplate>()

  const templates = useQuery({
    queryKey: keys.scheduleTemplates,
    queryFn: () => listScheduleTemplates(totals.staff.map(person => person.id)),
    enabled: !totals.loading,
  })

  const weekStart = weekStartOf(month === today().slice(0, 7) ? today() : monthStart(month))
  const ranges:Record<Period, { from:string; to:string }> = {
    week: { from: weekStart, to: dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD') },
    fourWeeks: { from: weekStart, to: dayjs(weekStart).add(27, 'day').format('YYYY-MM-DD') },
    month: { from: monthStart(month), to: dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD') },
  }
  const range = ranges[period]

  const apply = useMutation({
    mutationFn: async (template:ScheduleTemplate) => {
      const plans = slotPlansOf(template.pattern)
      const cells = generateCells({
        plans,
        pointId: target,
        from: range.from,
        to: range.to,
        config: { def: plans.length },
      })
      const plan = planCells(cells, totals.shifts.filter(shift => shift.pickupPointId === target))
      return applyCells(plan, {
        startsAt: template.startsAt,
        endsAt: template.endsAt,
        payMode: template.payMode,
        strategy: 'skip',
      })
    },
    onSuccess: result => {
      if (!result.added && !result.replaced) toastWarn('Все места на этом периоде уже заняты')
      else toastDone(`Добавлено смен: ${result.added}`)
      back()
    },
    onError: error => toastWarn(error instanceof Error ? error.message : 'Не удалось применить шаблон'),
  })

  const header = <Header title="Шаблоны графика" onBack={canBack ? back : undefined}/>
  if (templates.isLoading || totals.loading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>

  const rows = templates.data ?? []

  return <Screen
    header={header}
    footer={chosen ? <Button
      block
      disabled={apply.isPending}
      onClick={() => apply.mutate(chosen)}
    >Применить «{chosen.name}»</Button> : undefined}
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
      options={[
        { value: 'week', label: 'Эта неделя' },
        { value: 'fourWeeks', label: '4 недели' },
        { value: 'month', label: monthLabel(month).split(' ')[0] },
      ]}
    />
    <div className="mt-2 text-sub text-muted">С {dayLabel(range.from)} по {dayLabel(range.to)}</div>

    <SectionTitle count={rows.length}>Мои графики</SectionTitle>
    <Card>
      {rows.length === 0
        ? <EmptyState
          title="Шаблонов пока нет"
          sub="Настройте график в мастере и сохраните его — потом применяйте одним нажатием"
          action={<Button onClick={() => open('menu', { rows: [{ title: 'Открыть мастер графика', onClick: () => back() }] })}>Открыть мастер</Button>}
        />
        : <List>
          {rows.map(template => {
            const plans = slotPlansOf(template.pattern)
            const first = plans[0]?.pattern
            return <ListRow
              key={template.id}
              title={template.name}
              sub={[
                `мест: ${plans.length}`,
                first?.kind === 'cycle' ? `${first.on} через ${first.off}` : 'по дням недели',
                `${template.startsAt}–${template.endsAt}`,
                template.pickupPointId ? pointName(template.pickupPointId) : null,
              ].filter(Boolean).join(' · ')}
              align="start"
              pill={chosen?.id === template.id ? { label: 'выбран', tone: 'accent' } : undefined}
              onClick={() => setChosen(chosen?.id === template.id ? undefined : template)}
            />
          })}
        </List>}
    </Card>
  </Screen>
}
