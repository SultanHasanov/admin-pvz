export type Role = 'OWNER'|'MANAGER'|'EMPLOYEE'
export type ShiftStatus = 'PLANNED'|'ON_DUTY'|'COMPLETED'|'REPLACED'|'NO_SHOW'
export type PaymentType = 'SHIFT'|'HOURLY'|'SALARY'
/** Как оплачена смена: целиком, наполовину или по фактически отработанным часам. */
export type PayMode = 'FULL'|'HALF'|'HOURS'
export type PenaltyStatus = 'ASSIGNED'|'DISPUTED'|'CANCELLED'|'CONFIRMED'|'WITHHELD'
export type DeductionStatus = 'NEW'|'INVESTIGATING'|'DISPUTED'|'PENDING'|'CANCELLED_BY_WB'|'CONFIRMED_BY_WB'|'EMPLOYEE_LIABILITY'|'OWNER_LOSS'
export type EntryKind = 'INCOME'|'EXPENSE'
/** Заявка сотрудника: «не смогу выйти» в конкретный день, отпуск или больничный. */
export type ShiftRequestKind = 'SHIFT'|'VACATION'|'SICK'
/** Решение владельца. `SENT` — ещё открытая заявка, остальные четыре — исход. */
export type ShiftRequestStatus = 'SENT'|'SUBSTITUTE_FOUND'|'ALONE'|'APPROVED'|'DECLINED'
export type VacationKind = 'PAID'|'UNPAID'|'SICK'
export type Money = number

export interface PickupPoint { id:string; name:string; address:string; timezone:string; archivedAt:string|null; slotConfig?:SlotConfig; hours?:WorkingHours|null }
/** Часы работы точки. Становятся временем смен по умолчанию. */
export interface WorkingHours { from:string; to:string }
/** Сколько человек выходит на точку в день; исключения по дням недели от понедельника (0). */
export interface SlotConfig { def:number; wd?:Record<number, number> }
export interface Employee { id:string; fullName:string; phone?:string|null; telegramUsername?:string|null; pickupPointIds:string[]; paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number; salaryRateId:string|null; hourlyRateKopecks:number|null; status:'ACTIVE'|'ARCHIVED' }
export interface SalaryRule { id:string; employeeId:string; paymentType:PaymentType; rateKopecks:number; effectiveFrom:string; monthlyNormDays:number|null; salaryRateId:string|null; hourlyRateKopecks:number|null }
/** `slotIndex` и `workDate` появились с моделью мест на смене (миграция 0012). */
export interface Shift { id:string; employeeId:string; pickupPointId:string; startsAt:string; endsAt:string; actualStartsAt?:string|null; actualEndsAt?:string|null; payMode:PayMode; status:ShiftStatus; slotIndex?:number; workDate?:string }
export interface Transaction { id:string; kind:EntryKind; date:string; pickupPointId:string|null; category:string; amountKopecks:number; description?:string|null }
export interface Bonus { id:string; employeeId:string; date:string; amountKopecks:number; comment?:string|null }
export interface Penalty { id:string; employeeId:string; pickupPointId:string|null; date:string; amountKopecks:number; reason:string; comment?:string|null; status:PenaltyStatus }
export interface SalaryPayment { id:string; employeeId:string; date:string; accrualMonth?:string; pickupPointId?:string|null; amountKopecks:number; kind:'ADVANCE'|'PAYMENT'|'ADJUSTMENT'; comment?:string|null }
export interface Deduction { id:string; pickupPointId:string|null; employeeId:string|null; shiftId:string|null; eventAt:string|null; amountKopecks:number; reason:string; status:DeductionStatus; comment?:string|null; createdAt:string }
export interface DeductionEvent { id:string; deductionId:string; eventType:string; note:string|null; createdAt:string; authorEmployeeId?:string|null }
/** Доля удержания на одном сотруднике (миграция 0014). Остаток до суммы удержания — убыток владельца. */
export interface DeductionPart { deductionId:string; employeeId:string; amountKopecks:number }
export type InvitationStatus = 'SENT'|'ACCEPTED'|'REVOKED'
/** Приглашение в приложение. Код виден только владельцу — сотрудник вводит его, но не читает таблицу. */
export interface Invitation { id:string; employeeId:string; code:string; status:InvitationStatus; expiresAt:string; acceptedAt:string|null; createdAt:string }
export interface EntryPreset { id:string; pickupPointId:string; kind:EntryKind; categoryName:string; amountKopecks:number; updatedAt:string }
export interface SalaryRate { id:string; name:string|null; paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number; isDefault:boolean; archivedAt:string|null }
export interface ExpenseCategory { id:string; name:string; archivedAt:string|null }
export interface RecurringExpense { id:string; pickupPointId:string; categoryId:string; category:string; amountKopecks:number; dayOfMonth:number; description:string|null; active:boolean }
export interface RecurringExpenseOccurrence { id:string; recurringExpenseId:string; dueOn:string; status:'PENDING'|'PAID'|'SKIPPED'; expenseEntryId:string|null }
/** Заявка сотрудника (миграция 0013). Даты — календарные, без часовых поясов. */
export interface ShiftRequest { id:string; employeeId:string; pickupPointId:string|null; kind:ShiftRequestKind; dateFrom:string; dateTo:string; reason:string|null; status:ShiftRequestStatus; substituteEmployeeId:string|null; resolutionComment:string|null; resolvedAt:string|null; createdAt:string }
/** Отпуск хранится, а не выводится из заявки: владелец вводит его и задним числом. */
export interface Vacation { id:string; employeeId:string; dateFrom:string; dateTo:string; kind:VacationKind; sourceRequestId:string|null; comment:string|null }
/** Дни выплат организации (миграция 0016). Экран настройки появится в фазе 7. */
export interface PayoutSettings { advanceDay:number|null; payday:number|null; advanceMode:'FIXED'|'CALC'|'MANUAL'; advanceSumKopecks:number }
export interface TaxSettings { rate:number; enabled:boolean }
export interface DashboardSummary { income:number; expenses:number; payroll:number; tax:number; confirmedLosses:number; shifts:number }
export interface SalarySheet { employeeId:string; accrued:number; bonuses:number; penalties:number; deductions:number; paid:number; balance:number; shifts:number }
