import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '../../shared/kit/Card'
import { Button, TextButton } from '../../shared/kit/Button'
import { MoneyField, TextField } from '../../shared/kit/Field'
import { formatPhone } from '../../shared/format'
import { moneyInput, parseMoney } from '../../shared/money'
import { keys, scope } from '../../services/queries'
import { listSalaryRates } from '../../services/rates'
import { createEmployee } from '../../services/employees'
import { useWrite } from '../write'

/**
 * Короткое добавление сотрудника прямо из мастера графика: имя, телефон и ставка.
 * Сотрудник сразу привязывается к этому ПВЗ; приглашение можно отправить позже из «Людей».
 */
export function QuickAddEmployee({ pointId, onAdded }:{ pointId:string; onAdded:(employeeId:string) => void }) {
  const rates = useQuery({ queryKey: keys.salaryRates(), queryFn: () => listSalaryRates() })
  const preset = rates.data?.find(rate => rate.isDefault && !rate.archivedAt)
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [rate, setRate] = useState<string | null>(null)
  const rateText = rate ?? (preset ? moneyInput(preset.rateKopecks) : '')
  const rateKopecks = parseMoney(rateText)
  const fromPreset = !!preset && preset.rateKopecks === rateKopecks

  const save = useWrite({
    run: () => createEmployee({
      fullName, phone, pickupPointIds: [pointId],
      paymentType: fromPreset ? preset.paymentType : 'SHIFT',
      rateKopecks,
      monthlyNormDays: fromPreset ? preset.monthlyNormDays : 22,
      salaryRateId: fromPreset ? preset.id : null,
    }).then(onAdded),
    invalidate: [scope.employees, scope.salaryRules],
    done: () => `${fullName.trim().split(/\s+/)[0]} добавлен и поставлен в график`,
    onDone: () => { setOpen(false); setFullName(''); setPhone(''); setRate(null) },
  })

  if (!open) return <Button block variant="secondary" className="mt-2" onClick={() => setOpen(true)}>+ Добавить сотрудника</Button>
  return <Card className="mt-2 p-3">
    <div className="mb-3 font-semibold">Новый сотрудник</div>
    <TextField label="ФИО" value={fullName} placeholder="Ирина Соколова" autoComplete="off" onChange={event => setFullName(event.target.value)}/>
    <TextField label="Телефон" type="tel" inputMode="tel" value={phone} placeholder="+7 912 000-00-00" onChange={event => setPhone(formatPhone(event.target.value))}/>
    <MoneyField label="Ставка за смену" value={rateText} onValueChange={setRate}/>
    <Button block disabled={save.isPending || fullName.trim().length < 2 || !(rateKopecks > 0)} onClick={() => save.mutate(undefined as void)}>
      Добавить и поставить в график
    </Button>
    <div className="mt-2 text-center"><TextButton onClick={() => setOpen(false)}>Отмена</TextButton></div>
  </Card>
}
