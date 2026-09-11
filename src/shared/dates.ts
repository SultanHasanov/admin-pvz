import dayjs from 'dayjs'

export const currentMonth = () => dayjs().format('YYYY-MM')
export const monthStart = (month:string) => `${month}-01`
export const monthEnd = (month:string) => dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM-DD')
export const today = () => dayjs().format('YYYY-MM-DD')
export const monthLabel = (month:string) => {
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
  return `${names[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}
export const monthOptions = (count = 18) => Array.from({ length: count }, (_, i) => dayjs().subtract(i, 'month').format('YYYY-MM'))
export const dayLabel = (date:string) => dayjs(date).format('D MMM').replace('.', '')
export const timeLabel = (iso:string) => dayjs(iso).format('HH:mm')
export const dateLabel = (date:string) => dayjs(date).format('DD.MM.YYYY')
export const weekdayLabel = (date:string) => ['вс','пн','вт','ср','чт','пт','сб'][dayjs(date).day()]

/** Неделя начинается с понедельника: dayjs по умолчанию считает первым днём воскресенье. */
export const weekStartOf = (date:string) => dayjs(date).subtract((dayjs(date).day() + 6) % 7, 'day').format('YYYY-MM-DD')
export const weekDays = (weekStart:string) => Array.from({ length: 7 }, (_, i) => dayjs(weekStart).add(i, 'day'))

/** Все недели, задевающие месяц хотя бы одним днём. */
export const weeksOfMonth = (month:string) => {
  const first = weekStartOf(monthStart(month))
  const last = weekStartOf(dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD'))
  const weeks:string[] = []
  for (let cursor = dayjs(first); !cursor.isAfter(dayjs(last), 'day'); cursor = cursor.add(1, 'week')) weeks.push(cursor.format('YYYY-MM-DD'))
  return weeks
}

/** «7–13 сентября», а внутри месяца-перевёртыша — «28 сент. – 4 окт.». */
export const weekLabel = (weekStart:string) => {
  const from = dayjs(weekStart), to = from.add(6, 'day')
  const short = ['янв','фев','мар','апр','мая','июн','июл','авг','сент','окт','ноя','дек']
  return from.month() === to.month()
    ? `${from.date()}–${to.date()} ${short[to.month()]}`
    : `${from.date()} ${short[from.month()]} – ${to.date()} ${short[to.month()]}`
}
