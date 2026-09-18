import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Button } from '../../shared/kit/Button'
import { Card } from '../../shared/kit/Card'
import { Banner, MoneyField, TextField } from '../../shared/kit/Field'
import { toastDone } from '../../shared/kit/Toaster'
import { haptics } from '../../shared/kit/haptics'
import { cn } from '../../shared/kit/cn'
import { formatPhone } from '../../shared/format'
import { parseMoney } from '../../shared/money'
import { plural } from '../../shared/format'
import { appUrl, supabase } from '../../lib/supabase'
import { createEmployee } from '../../services/employees'
import { applyStarterSchedule, createOrganization } from '../../services/onboarding'
import { AuthLayout } from './AuthLayout'

/** Название организации до подтверждения почты: письмо уводит из вкладки, черновик должен дожить. */
const DRAFT = 'pvz.onboarding.org'
const readDraft = () => { try { return localStorage.getItem(DRAFT) ?? '' } catch { return '' } }
const saveDraft = (value:string) => { try { localStorage.setItem(DRAFT, value) } catch { /* приватный режим */ } }

const STEPS = {
  1: { title: 'Как называется организация?', sub: 'Это увидят сотрудники в приглашении.' },
  2: { title: 'Первый пункт выдачи', sub: 'Часы работы станут временем смен по умолчанию.' },
  3: { title: 'Первый сотрудник', sub: 'Ставку можно изменить в любой момент — прошлые смены не пересчитаются.' },
  4: { title: 'Заполнить график?', sub: 'Можно применить шаблон сейчас или сделать это позже.' },
} as const

/**
 * Регистрация организации в четыре шага, как в прототипе: организация, первый пункт,
 * первый сотрудник, график. Первые два шага записываются одним RPC в конце второго:
 * организации без точки в базе не бывает. Третий и четвёртый можно пропустить.
 *
 * Без сессии первый шаг ещё и создаёт аккаунт; если проект требует подтверждения
 * почты, человек вернётся по ссылке уже со входом, и шаг попросит только название.
 */
export default function Onboarding({ session, onDone }:{ session:Session | null; onDone:() => Promise<void> }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [info, setInfo] = useState<string>()

  const [organization, setOrganization] = useState(readDraft)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pointName, setPointName] = useState('')
  const [address, setAddress] = useState('')
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('21:00')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [rate, setRate] = useState('2 000')

  const [pointId, setPointId] = useState<string>()
  const [employeeId, setEmployeeId] = useState<string>()

  const run = async (action:() => Promise<void>) => {
    setBusy(true); setError(undefined)
    try { await action() }
    catch (failure) { haptics.error(); setError(failure instanceof Error ? failure.message : 'Не получилось — попробуйте ещё раз') }
    finally { setBusy(false) }
  }

  const finish = async (message?:string) => {
    try { localStorage.removeItem(DRAFT) } catch { /* приватный режим */ }
    if (message) toastDone(message)
    await onDone()
    navigate('/home', { replace: true })
  }

  const next = () => run(async () => {
    if (step === 1) {
      saveDraft(organization.trim())
      if (!session) {
        if (!supabase) return
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: appUrl('/register') },
        })
        if (result.error) throw result.error
        // Проект требует подтверждения почты — сессии ещё нет, дальше идти не с чем.
        if (!result.data.session) { setInfo(`Письмо отправлено на ${email.trim()}. Откройте ссылку — регистрация продолжится с этого шага.`); return }
      }
      setStep(2)
    } else if (step === 2) {
      setPointId(await createOrganization({ name: organization, pointName, address, hours: { from, to } }))
      setStep(3)
    } else if (step === 3) {
      setEmployeeId(await createEmployee({
        fullName, phone, pickupPointIds: [pointId!],
        paymentType: 'SHIFT', rateKopecks: parseMoney(rate), monthlyNormDays: 22,
      }))
      setStep(4)
    } else {
      const count = await applyStarterSchedule({ employeeId: employeeId!, pointId: pointId!, hours: { from, to } })
      await finish(`Готово. Создано ${count} ${plural(count, 'смена', 'смены', 'смен')} на ${dayjs().format('MMMM').toLowerCase()}`)
    }
  })

  const skip = () => run(async () => {
    if (step === 3) setStep(4)
    else await finish()
  })

  const valid = {
    1: organization.trim().length >= 2 && (session !== null || (email.includes('@') && password.length >= 6)),
    2: pointName.trim().length > 0 && address.trim().length > 0 && /^\d\d:\d\d$/.test(from) && /^\d\d:\d\d$/.test(to),
    3: fullName.trim().length > 1 && parseMoney(rate) > 0,
    4: Boolean(employeeId && pointId),
  }[step]

  return <AuthLayout>
    <div className="mb-5 flex gap-1.5">
      {[1, 2, 3, 4].map(index => <div key={index} className={cn('h-[3px] flex-1 rounded-sm', index <= step ? 'bg-accent' : 'bg-line-strong')}/>)}
    </div>
    <div className="lbl">Шаг {step} из 4</div>
    <div className="mt-2 mb-1.5 text-date leading-[1.15] font-semibold tracking-[-0.025em]">{STEPS[step].title}</div>
    <div className="mb-5 text-row leading-[1.45] text-muted">{STEPS[step].sub}</div>

    {step === 1 && <>
      <TextField label="Название" value={organization} placeholder="ИП Ковалёв А. С." onChange={event => setOrganization(event.target.value)}/>
      {!session && <>
        <TextField label="Почта для входа" type="email" inputMode="email" autoComplete="email" placeholder="ivan@pvz.ru" value={email} onChange={event => setEmail(event.target.value)}/>
        <TextField label="Пароль" type="password" autoComplete="new-password" hint="Не короче 6 символов" value={password} onChange={event => setPassword(event.target.value)}/>
      </>}
    </>}

    {step === 2 && <>
      <TextField label="Название пункта" value={pointName} placeholder="ПВЗ Ленина 12" onChange={event => setPointName(event.target.value)}/>
      <TextField label="Адрес" value={address} placeholder="ул. Ленина, 12" onChange={event => setAddress(event.target.value)}/>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Открытие" type="time" value={from} onChange={event => setFrom(event.target.value)}/>
        <TextField label="Закрытие" type="time" value={to} onChange={event => setTo(event.target.value)}/>
      </div>
    </>}

    {step === 3 && <>
      <TextField label="ФИО" value={fullName} placeholder="Ирина Соколова" onChange={event => setFullName(event.target.value)}/>
      <TextField label="Телефон" type="tel" inputMode="tel" value={phone} placeholder="+7 912 000-00-00" onChange={event => setPhone(formatPhone(event.target.value))}/>
      <MoneyField label="Ставка за смену" value={rate} onValueChange={setRate}/>
    </>}

    {step === 4 && <Card className="p-4">
      <div className="text-row font-semibold">Шаблон «Основной 2/2»</div>
      <div className="mt-1 text-sub leading-[1.45] text-muted">
        {fullName.split(' ')[0] || 'Сотрудник'} выходит две смены через две, с сегодняшнего дня до конца месяца, {from}–{to}.
        Изменить можно в любой момент в мастере графика.
      </div>
    </Card>}

    {info && <div className="mt-3"><Banner tone="info">{info}</Banner></div>}
    {error && <div className="mt-3"><Banner tone="bad">{error}</Banner></div>}

    <Button block className="mt-5" disabled={!valid || busy} onClick={() => void next()}>
      {step === 4 ? 'Применить и войти' : 'Далее'}
    </Button>
    {step >= 3 && <Button block variant="quiet" className="mt-1" disabled={busy} onClick={() => void skip()}>
      {step === 4 ? 'Пропустить и войти' : 'Пропустить'}
    </Button>}
    {step === 1 && !session && <Button block variant="quiet" className="mt-1" onClick={() => navigate('/login')}>У меня уже есть аккаунт</Button>}
  </AuthLayout>
}
