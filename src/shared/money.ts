export const rubles = (kopecks:number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100)
export const parseMoney = (value:string) => Math.round(Number(String(value).replace(/\s/g, '').replace(',', '.')) * 100)
/**
 * Копейки в значение поля ввода: 220000 → «2 200». Разделитель — обычный пробел, как
 * расставляет MoneyField при наборе: иначе подставленная сумма выглядит не так, как набранная.
 * parseMoney пробелы и запятую понимает, так что значение читается обратно без потерь.
 */
export const moneyInput = (kopecks:number) =>
  (Math.round(kopecks) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/\s/g, ' ')
export const isValidMoney = (value:string) => Number.isFinite(parseMoney(value)) && parseMoney(value) > 0
