import dayjs from 'dayjs'
import { PickList } from '../shared/kit/PickList'
import { currentMonth, monthLabel, monthOptions } from '../shared/dates'
import { useOrg } from '../app/OrgContext'

/**
 * Выбор месяца. Показываем один месяц вперёд — график и регулярные расходы
 * планируют заранее, — и год назад: дальше в прошлое владельцы не заглядывают.
 *
 * График передаёт свои `value`/`onPick`: он листается стрелками отдельно от главной,
 * и подсвечивать надо тот месяц, что сейчас на экране, а не месяц главной.
 */
export default function MonthPickSheet({ close, value, onPick }:{
  close:() => void
  value?:string
  onPick?:(month:string) => void
}) {
  const { month, setMonth } = useOrg()
  const now = currentMonth()
  const next = dayjs(`${now}-01`).add(1, 'month').format('YYYY-MM')
  const months = [next, ...monthOptions(13)]
  const current = value ?? month
  // Стрелками графика можно уйти дальше списка — такой месяц тоже показываем, иначе нечего подсветить.
  const options = months.includes(current) ? months : [...months, current].sort().reverse()

  const note = (item:string) => item === now ? 'Текущий месяц'
    : item === next ? 'Следующий · план'
      : item > now ? 'план' : 'завершён'

  return <PickList
    value={current}
    onPick={picked => { (onPick ?? setMonth)(picked); close() }}
    options={options.map(item => ({ value: item, name: monthLabel(item), sub: note(item) }))}
  />
}
