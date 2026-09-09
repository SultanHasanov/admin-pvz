import { describe, expect, it } from 'vitest'
import { calculatePayroll, profit } from './calculations'
import type { Employee, Shift } from './types'

const worker:Employee={id:'e',fullName:'Иван',pickupPointIds:['p'],paymentType:'SHIFT',rateKopecks:200000,status:'ACTIVE'}
const completed:Shift={id:'s',employeeId:'e',pickupPointId:'p',startsAt:'2026-09-01T08:00:00+03:00',endsAt:'2026-09-01T22:00:00+03:00',status:'COMPLETED'}
describe('payroll calculations',()=>{
  it('accrues a completed shift only',()=>expect(calculatePayroll(worker,[completed],'2026-09',22)).toBe(200000))
  it('does not subtract payroll twice from profit',()=>expect(profit({income:10000,expenses:2000,payroll:3000,tax:500,confirmedLosses:0,shifts:1})).toBe(4500))
})
