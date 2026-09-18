import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Button } from '../shared/kit/Button'
import { MoneyField, TextField } from '../shared/kit/Field'
import { toastError } from '../shared/kit/Toaster'
import { cn } from '../shared/kit/cn'
import { haptics } from '../shared/kit/haptics'
import { formatPhone } from '../shared/format'
import { moneyInput, parseMoney, rubles } from '../shared/money'
import { keys, scope } from '../services/queries'
import { listSalaryRates } from '../services/rates'
import { createEmployee } from '../services/employees'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { PointChecklist } from './PointChecklist'

const STEPS = {
  1: { title: 'ФИО и телефон', sub: 'Как зовут сотрудника и куда отправить приглашение.' },
  2: { title: 'На каких ПВЗ работает', sub: 'Можно выбрать несколько точек.' },
  3: { title: 'Ставка за смену', sub: 'Подставлена ставка из настроек — измените, если нужно.' },
} as const

/**
 * Новый сотрудник — мастер из трёх шагов, как `addEmp` в прототипе: имя и телефон,
 * точки, ставка. Ставка подставляется из справочника (`is_default` в `salary_rates`);
 * если её не меняли, правило ссылается на справочную ставку, а не только копирует сумму.
 *
 * После записи мастер не закрывается, а показывает итог с приглашением в приложение —
 * следующий шаг почти всегда именно он.
 */
export default function EmployeeNew() {
  const { points, pointId } = useOrg()
  const { back, canBack } = useNav()
  const navigate = useNavigate()
  const location = useLocation()
  const rates = useQuery({ queryKey: keys.salaryRates(), queryFn: () => listSalaryRates() })
  const preset = rates.data?.find(rate => rate.isDefault && !rate.archivedAt)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  // Выбран фильтр ПВЗ — скорее всего, человек нанят именно туда. Одна точка — выбирать нечего.
  const [picked, setPicked] = useState<string[]>(() => pointId ? [pointId] : points.length === 1 ? [points[0].id] : [])
  // null — «не трогали»: показываем ставку из справочника, как только она загрузится.
  const [rate, setRate] = useState<string | null>(null)
  const [created, setCreated] = useState<string>()

  const rateText = rate ?? (preset ? moneyInput(preset.rateKopecks) : '')
  const rateKopecks = parseMoney(rateText)
  const fromPreset = !!preset && preset.rateKopecks === rateKopecks
  const pointLabel = picked.map(id => points.find(point => point.id === id)?.name ?? '—').join(', ')
  const firstName = fullName.trim().split(/\s+/)[0] || 'Сотрудник'

  const save = useWrite({
    run: () => createEmployee({
      fullName, phone, pickupPointIds: picked,
      paymentType: fromPreset ? preset.paymentType : 'SHIFT',
      rateKopecks,
      monthlyNormDays: fromPreset ? preset.monthlyNormDays : 22,
      salaryRateId: fromPreset ? preset.id : null,
    }).then(setCreated),
    invalidate: [scope.employees, scope.salaryRules],
    done: () => `${firstName} добавлен · ставка ${rubles(rateKopecks)}`,
  })

  const next = () => {
    if (step === 1) {
      if (fullName.trim().length < 2) { haptics.error(); toastError('Укажите ФИО'); return }
      setStep(2)
    } else if (step === 2) {
      if (!picked.length) { haptics.error(); toastError('Выберите хотя бы один ПВЗ'); return }
      setStep(3)
    } else save.mutate(undefined as void)
  }

  const header = <Header
    title="Новый сотрудник"
    // Шаг назад внутри мастера, а не выход из него: иначе теряется всё введённое.
    onBack={created ? undefined : step > 1 ? () => setStep(step === 3 ? 2 : 1) : canBack ? back : undefined}
  />

  const dots = <div className="mb-[18px] flex gap-1.5">
    {[1, 2, 3].map(index => <div key={index} className={cn('h-[3px] flex-1 rounded-sm', index <= step ? 'bg-accent' : 'bg-line-strong')}/>)}
  </div>

  if (created) return <Screen header={header}>
    {dots}
    <Card className="px-[18px] py-[22px] text-center">
      <div className="mx-auto mb-[13px] flex size-[46px] items-center justify-center rounded-[15px] bg-ok-tint-2 text-[20px] font-bold text-ok">✓</div>
      <div className="text-[19px] font-semibold">{firstName} добавлен</div>
      <div className="mt-1.5 text-act leading-[1.45] text-muted">
        Ставка {rubles(rateKopecks)} · {pointLabel}. Осталось поставить его в график.
      </div>
      {/* Замена, а не новый экран поверх: «назад» из приглашения ведёт в список, а не в пустой мастер. */}
      <Button block className="mt-4" onClick={() => navigate(`/people/${created}/invite`, { replace: true, state: location.state })}>
        Пригласить в приложение
      </Button>
      <Button block variant="quiet" className="mt-[7px]" onClick={back}>Позже</Button>
    </Card>
  </Screen>

  return <Screen
    header={header}
    footer={<Button block disabled={save.isPending || (step === 3 && !(rateKopecks > 0))} onClick={next}>
      {step === 3 ? 'Добавить сотрудника' : 'Далее'}
    </Button>}
  >
    {dots}
    <div className="lbl">Шаг {step} из 3</div>
    <div className="mt-[7px] mb-[5px] text-[23px] font-semibold tracking-[-0.025em]">{STEPS[step].title}</div>
    <div className="mb-[18px] text-[14px] leading-[1.45] text-muted">{STEPS[step].sub}</div>

    {step === 1 && <>
      <TextField label="ФИО" value={fullName} placeholder="Ирина Соколова" autoComplete="off" onChange={event => setFullName(event.target.value)}/>
      <TextField label="Телефон" type="tel" inputMode="tel" value={phone} placeholder="+7 912 000-00-00" onChange={event => setPhone(formatPhone(event.target.value))}/>
    </>}

    {step === 2 && <PointChecklist points={points} picked={picked} onChange={setPicked}/>}

    {step === 3 && <>
      <div className="mb-3.5 rounded-md bg-accent-tint px-3.5 py-[13px] text-[13px] leading-[1.45] text-accent">
        {preset
          ? `По умолчанию ${rubles(preset.rateKopecks)} — из настроек организации.`
          : 'Ставка по умолчанию не задана — её можно указать в «Ещё» → «Настройки».'}
      </div>
      <MoneyField label="Ставка за смену" value={rateText} onValueChange={setRate}/>
      <Card className="p-[15px]">
        <div className="text-[13px] text-muted">Итого</div>
        {[
          ['Сотрудник', fullName.trim() || '—'],
          ['Телефон', phone || '—'],
          ['ПВЗ', pointLabel || '—'],
          ['Ставка', rateKopecks > 0 ? rubles(rateKopecks) : '—'],
        ].map(([key, value]) => <div key={key} className="mt-2 flex justify-between gap-2.5">
          <div className="text-act text-muted-strong">{key}</div>
          <div className="text-right text-act font-medium">{value}</div>
        </div>)}
      </Card>
    </>}
  </Screen>
}
