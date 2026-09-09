export type ModuleKey = 'employees'|'shifts'|'salary'|'income'|'expenses'|'taxes'|'penalties'|'wb_deductions'|'telegram'|'analytics'|'valuable_items'
export type Role = 'OWNER'|'MANAGER'|'EMPLOYEE'
export type ShiftStatus = 'PLANNED'|'ON_DUTY'|'COMPLETED'|'REPLACED'|'NO_SHOW'
export type Money = number
export interface PickupPoint { id:string; name:string; address:string; timezone:string; active:boolean }
export interface Employee { id:string; fullName:string; phone?:string; pickupPointIds:string[]; paymentType:'SHIFT'|'HOURLY'|'SALARY'; rateKopecks:number; status:'ACTIVE'|'ARCHIVED' }
export interface Shift { id:string; employeeId:string; pickupPointId:string; startsAt:string; endsAt:string; actualStartsAt?:string; actualEndsAt?:string; status:ShiftStatus }
export interface Transaction { id:string; kind:'INCOME'|'EXPENSE'; date:string; pickupPointId:string; category:string; amountKopecks:number; description?:string }
export interface DashboardSummary { income:number; expenses:number; payroll:number; tax:number; confirmedLosses:number; shifts:number; }
