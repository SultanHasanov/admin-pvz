export const rubles = (kopecks:number) => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(kopecks / 100)
export const parseMoney = (value:string) => Math.round(Number(value.replace(',','.')) * 100)
