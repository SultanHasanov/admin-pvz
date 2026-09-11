import type { PayMode, PaymentType, SalaryRate } from '../entities/types'
import { rubles } from './money'

export const paymentTitles:Record<PaymentType, string> = { SHIFT: 'За смену', HOURLY: 'Почасовая', SALARY: 'Оклад' }
export const payModeTitles:Record<PayMode, string> = { FULL: 'Полная смена', HALF: 'Половина смены', HOURS: 'По фактическим часам' }
export const paymentUnit:Record<PaymentType, string> = { SHIFT: 'за смену', HOURLY: 'в час', SALARY: 'в месяц' }

/** «2 500 ₽ за смену» — одинаково выглядит и в справочнике, и в карточке сотрудника. */
export const rateAmount = (rate:{ paymentType:PaymentType; rateKopecks:number }) => `${rubles(rate.rateKopecks)} ${paymentUnit[rate.paymentType]}`
/** Имя ставки — необязательная пометка: без неё ставка называет себя сама. */
export const rateTitle = (rate:SalaryRate) => rate.name?.trim() || `${paymentTitles[rate.paymentType]} · ${rubles(rate.rateKopecks)}`
export const rateOption = (rate:SalaryRate) => rate.name?.trim() ? `${rate.name.trim()} — ${rateAmount(rate)}` : rateTitle(rate)
