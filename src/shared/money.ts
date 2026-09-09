export const rubles = (kopecks:number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100)
export const parseMoney = (value:string) => Math.round(Number(String(value).replace(/\s/g, '').replace(',', '.')) * 100)
/** Копейки в значение поля ввода: 220000 → «2200». */
export const moneyInput = (kopecks:number) => String(Math.round(kopecks) / 100)
export const isValidMoney = (value:string) => Number.isFinite(parseMoney(value)) && parseMoney(value) > 0
