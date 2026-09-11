export type ModuleKey = 'employees'|'shifts'|'salary'|'income'|'expenses'|'taxes'|'penalties'|'wb_deductions'|'telegram'|'analytics'|'valuable_items'
export type Role = 'OWNER'|'MANAGER'|'EMPLOYEE'
export type ShiftStatus = 'PLANNED'|'ON_DUTY'|'COMPLETED'|'REPLACED'|'NO_SHOW'
export type PaymentType = 'SHIFT'|'HOURLY'|'SALARY'
/** Как оплачена смена: целиком, наполовину или по фактически отработанным часам. */
export type PayMode = 'FULL'|'HALF'|'HOURS'
export type PenaltyStatus = 'ASSIGNED'|'DISPUTED'|'CANCELLED'|'CONFIRMED'|'WITHHELD'
export type DeductionStatus = 'NEW'|'INVESTIGATING'|'DISPUTED'|'PENDING'|'CANCELLED_BY_WB'|'CONFIRMED_BY_WB'|'EMPLOYEE_LIABILITY'|'OWNER_LOSS'
export type EntryKind = 'INCOME'|'EXPENSE'
export type Money = number

export interface PickupPoint { id:string; name:string; address:string; timezone:string; archivedAt:string|null }
export interface Employee { id:string; fullName:string; phone?:string|null; telegramUsername?:string|null; pickupPointIds:string[]; paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number; salaryRateId:string|null; hourlyRateKopecks:number|null; status:'ACTIVE'|'ARCHIVED' }
export interface SalaryRule { id:string; employeeId:string; paymentType:PaymentType; rateKopecks:number; effectiveFrom:string; monthlyNormDays:number|null; salaryRateId:string|null; hourlyRateKopecks:number|null }
export interface Shift { id:string; employeeId:string; pickupPointId:string; startsAt:string; endsAt:string; actualStartsAt?:string|null; actualEndsAt?:string|null; payMode:PayMode; status:ShiftStatus }
export interface Transaction { id:string; kind:EntryKind; date:string; pickupPointId:string|null; category:string; amountKopecks:number; description?:string|null }
export interface Bonus { id:string; employeeId:string; date:string; amountKopecks:number; comment?:string|null }
export interface Penalty { id:string; employeeId:string; pickupPointId:string|null; date:string; amountKopecks:number; reason:string; comment?:string|null; status:PenaltyStatus }
export interface SalaryPayment { id:string; employeeId:string; date:string; amountKopecks:number; kind:'ADVANCE'|'PAYMENT'|'ADJUSTMENT'; comment?:string|null }
export interface Deduction { id:string; pickupPointId:string|null; employeeId:string|null; shiftId:string|null; eventAt:string|null; amountKopecks:number; reason:string; status:DeductionStatus; comment?:string|null; createdAt:string }
export interface DeductionEvent { id:string; deductionId:string; eventType:string; note:string|null; createdAt:string }
export interface EntryPreset { id:string; pickupPointId:string; kind:EntryKind; categoryName:string; amountKopecks:number; updatedAt:string }
export interface SalaryRate { id:string; name:string|null; paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number; isDefault:boolean; archivedAt:string|null }
export interface ExpenseCategory { id:string; name:string; archivedAt:string|null }
export interface TaxSettings { rate:number; enabled:boolean }
export interface DashboardSummary { income:number; expenses:number; payroll:number; tax:number; confirmedLosses:number; shifts:number }
export interface SalarySheet { employeeId:string; accrued:number; bonuses:number; penalties:number; deductions:number; paid:number; balance:number; shifts:number }
