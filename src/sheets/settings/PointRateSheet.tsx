import { useState } from 'react'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { MoneyField } from '../../shared/kit/Field'
import { DateField } from '../../shared/kit/DateField'
import { parseMoney, rubles } from '../../shared/money'
import { dayLabel, today } from '../../shared/dates'
import { rateForDate } from '../../entities/calculations'
import { listEmployees, listSalaryRules, saveRate } from '../../services/employees'
import { keys, scope } from '../../services/queries'
import { useWrite } from '../../features/write'
import { useOrg } from '../../app/OrgContext'

/**
 * Новая ставка за смену с даты — сразу всем сотрудникам пункта. Каждому пишется своя строка
 * в историю ставок, как при смене ставки одного человека: прошлые смены не пересчитываются.
 * Ставка принадлежит сотруднику, а не пункту, поэтому у работающих на нескольких ПВЗ
 * она сменится и для других пунктов — об этом говорим рядом с именем.
 */
export default function PointRateSheet({ pointId, close }:{ pointId:string; close:() => void }) {
  const { points } = useOrg()
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  const rules = useQuery({ queryKey: keys.salaryRules, queryFn: () => listSalaryRules() })
  const [amount, setAmount] = useState('')
  // Как и у одного сотрудника — с первого числа следующего месяца, чтобы месяц не делился на две ставки.
  const [from, setFrom] = useState(dayjs(today()).add(1, 'month').startOf('month').format('YYYY-MM-DD'))
  const kopecks = parseMoney(amount)

  const people = (employees.data ?? []).filter(person => person.status === 'ACTIVE' && person.pickupPointIds.includes(pointId))
    .map(person => {
      const current = rateForDate((rules.data ?? []).filter(rule => rule.employeeId === person.id), from)
      const others = person.pickupPointIds.filter(id => id !== pointId).map(id => points.find(point => point.id === id)?.name).filter(Boolean)
      return { person, current, others, perShift: !current || current.paymentType === 'SHIFT' }
    })
  // Оклад и почасовая считаются иначе — сумма за смену к ним не подходит.
  const [skipped, setSkipped] = useState<string[]>([])
  const chosen = people.filter(row => row.perShift && !skipped.includes(row.person.id))

  const write = useWrite({
    run: async () => {
      for (const { person, current } of chosen) {
        await saveRate(person.id, {
          paymentType: 'SHIFT',
          rateKopecks: kopecks,
          monthlyNormDays: current?.monthlyNormDays ?? 22,
          salaryRateId: null,
          hourlyRateKopecks: null,
        }, from)
      }
    },
    invalidate: [scope.salaryRules, scope.employees],
    done: `Ставка ${rubles(kopecks)} с ${dayLabel(from)} · сотрудников: ${chosen.length}`,
    onDone: close,
  })

  return <>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Всем отмеченным сотрудникам пункта. Смены до этой даты останутся по прежней ставке.
    </div>
    <MoneyField label="Ставка за смену" value={amount} onValueChange={setAmount}/>
    <DateField label="Действует с" value={from} onChange={setFrom}/>

    <div className="mb-2 text-sub font-semibold text-muted">Кому меняем · {chosen.length} из {people.length}</div>
    {!people.length && <div className="mb-3 text-sub text-muted">На этом пункте нет активных сотрудников.</div>}
    <div className="mb-4 grid gap-1">
      {people.map(({ person, current, others, perShift }) => {
        const checked = perShift && !skipped.includes(person.id)
        return <label key={person.id} className={`flex min-h-11 items-start gap-3 rounded-md px-3 py-2 ${checked ? 'bg-accent-faint' : 'bg-surface-soft'} ${perShift ? '' : 'opacity-55'}`}>
          <input type="checkbox" checked={checked} disabled={!perShift}
            onChange={() => setSkipped(list => list.includes(person.id) ? list.filter(id => id !== person.id) : [...list, person.id])}
            className="mt-0.5 size-5 flex-none" style={{ accentColor: 'var(--color-accent)' }}/>
          <span className="min-w-0 flex-1">
            <span className="block text-row text-ink">{person.fullName}</span>
            <span className="block text-sub text-muted">
              {!perShift ? `${current?.paymentType === 'SALARY' ? 'Оклад' : 'Почасовая оплата'} — не меняется`
                : current ? `Сейчас ${rubles(current.rateKopecks)}` : 'Ставка не задана'}
              {perShift && others.length ? ` · работает и на ${others.join(', ')}: ставка сменится и там` : ''}
            </span>
          </span>
        </label>
      })}
    </div>

    <Button block disabled={!(kopecks > 0) || !chosen.length || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить ставку для {chosen.length}
    </Button>
  </>
}
