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
