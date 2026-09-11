import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'
import { deriveWeekPattern, generateSlots, withTimes, type PlannedSlot } from '../../entities/schedule'
import { weekLabel, weeksOfMonth } from '../../shared/dates'
import { FormModal } from '../../shared/ui'

/**
 * Берёт график с уже заполненной недели и повторяет его на выбранных.
 * Записью не занимается — отдаёт выходы наверх, в общий движок применения.
 */
export function CopyWeekModal({ weekStart, month, shifts, onClose, onReady }:{
  weekStart:string
  month:string
  shifts:Shift[]
  onClose:() => void
  onReady:(slots:PlannedSlot[]) => void
}) {
  const { pattern, times } = useMemo(() => deriveWeekPattern(weekStart, shifts), [weekStart, shifts])

  // Предлагаем недели текущего месяца и следующего — типичный горизонт планирования.
  const options = useMemo(() => {
    const next = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
    return [...new Set([...weeksOfMonth(month), ...weeksOfMonth(next)])].filter(week => week !== weekStart)
  }, [month, weekStart])

  const [selected, setSelected] = useState<string[]>([])
  const staffCount = Object.values(pattern.byEmployee).filter(days => days.length).length
  const perWeek = Object.values(pattern.byEmployee).reduce((sum, days) => sum + days.length, 0)

  const build = () => {
    const slots = selected.flatMap(week => generateSlots(pattern, week, dayjs(week).add(6, 'day').format('YYYY-MM-DD')))
    onReady(withTimes(slots, times))
  }

  return <FormModal
    title="Применить эту неделю к другим" onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" disabled={!selected.length || !perWeek} onClick={build}>
        Применить{selected.length ? ` на ${selected.length} нед.` : ''}
      </Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    {!perWeek
      ? <Alert type="warning" showIcon message="На этой неделе нет смен — копировать нечего."/>
      : <>
        <Typography.Paragraph type="secondary">
          Возьмём расписание недели {weekLabel(weekStart)}: {staffCount} сотрудник(ов), {perWeek} смен.
          Личное время каждого сохранится.
        </Typography.Paragraph>

        <div className="mb-3">
          <Button size="small" onClick={() => setSelected(selected.length === options.length ? [] : options)}>
            {selected.length === options.length ? 'Снять все' : 'Выбрать все'}
          </Button>
        </div>

        <Checkbox.Group
          value={selected} onChange={values => setSelected(values as string[])}
          options={options.map(week => ({ value: week, label: weekLabel(week) }))}
          style={{ display: 'grid', gap: 8 }}
        />
      </>}
  </FormModal>
}
