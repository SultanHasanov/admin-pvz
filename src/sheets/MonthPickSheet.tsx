import dayjs from 'dayjs'
import { PickList } from '../shared/kit/PickList'
import { currentMonth, monthLabel, monthOptions } from '../shared/dates'
import { useOrg } from '../app/OrgContext'

/**
 * Выбор месяца. Показываем один месяц вперёд — график и регулярные расходы
 * планируют заранее, — и год назад: дальше в прошлое владельцы не заглядывают.
 */
export default function MonthPickSheet({ close }:{ close:() => void }) {
  const { month, setMonth } = useOrg()
  const now = currentMonth()
  const next = dayjs(`${now}-01`).add(1, 'month').format('YYYY-MM')
  const months = [next, ...monthOptions(13)]

  const note = (value:string) => value === now ? 'Текущий месяц'
    : value === next ? 'Следующий · план'
      : value > now ? 'план' : 'завершён'

  return <PickList
    value={month}
    onPick={value => { setMonth(value); close() }}
    options={months.map(value => ({ value, name: monthLabel(value), sub: note(value) }))}
  />
}
