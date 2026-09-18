import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Button } from '../shared/kit/Button'
import { TextField } from '../shared/kit/Field'
import { SectionTitle } from '../shared/kit/Text'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { formatPhone } from '../shared/format'
import type { Employee } from '../entities/types'
import { scope } from '../services/queries'
import { updateEmployee } from '../services/employees'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { PointChecklist } from './PointChecklist'

/**
 * Данные сотрудника: имя, телефон, точки. Ставка здесь не меняется — у неё своя история
 * с датой начала (`/people/:id/rates`), иначе правка задним числом пересчитала бы прошлое.
 */
export default function EmployeeEdit() {
  const { id = '' } = useParams()
  const { back, canBack } = useNav()
  const totals = useMonthTotals()
  const employee = totals.staff.find(person => person.id === id)
  const header = <Header title="Данные сотрудника" onBack={canBack ? back : undefined}/>

  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (!employee) return <Screen header={header}><Card><EmptyState title="Сотрудник не найден"/></Card></Screen>
  // Форма монтируется по карточке: начальные значения берутся один раз.
  return <EmployeeForm key={employee.id} employee={employee} header={header}/>
}

function EmployeeForm({ employee, header }:{ employee:Employee; header:React.ReactNode }) {
  const { points } = useOrg()
  const { back } = useNav()
  const [fullName, setFullName] = useState(employee.fullName)
  const [phone, setPhone] = useState(employee.phone ?? '')
  const [picked, setPicked] = useState(employee.pickupPointIds)

  const save = useWrite({
    run: () => updateEmployee(employee.id, {
      fullName, phone, telegramUsername: employee.telegramUsername ?? undefined, pickupPointIds: picked,
      paymentType: employee.paymentType, rateKopecks: employee.rateKopecks, monthlyNormDays: employee.monthlyNormDays,
    }),
    invalidate: [scope.employees],
    done: 'Данные сотрудника сохранены',
    onDone: back,
  })

  const valid = fullName.trim().length >= 2 && picked.length > 0

  return <Screen
    header={header}
    footer={<Button block disabled={!valid || save.isPending} onClick={() => save.mutate(undefined as void)}>Сохранить</Button>}
  >
    <Card className="p-4">
      <TextField label="ФИО" value={fullName} autoComplete="off" onChange={event => setFullName(event.target.value)}/>
      <TextField label="Телефон" type="tel" inputMode="tel" value={phone} placeholder="+7 912 000-00-00" onChange={event => setPhone(formatPhone(event.target.value))}/>
    </Card>
    <SectionTitle>На каких ПВЗ работает</SectionTitle>
    <PointChecklist points={points} picked={picked} onChange={setPicked}/>
    {!picked.length && <div className="mt-2 text-sub text-bad">Выберите хотя бы один ПВЗ — иначе сотрудника не будет в выборе на смену.</div>}
  </Screen>
}
