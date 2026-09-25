import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../shared/kit/Button'
import { Card } from '../../shared/kit/Card'
import { Banner, MoneyField, TextField } from '../../shared/kit/Field'
import { toastDone } from '../../shared/kit/Toaster'
import { haptics } from '../../shared/kit/haptics'
import { cn } from '../../shared/kit/cn'
import { formatPhone } from '../../shared/format'
import { parseMoney } from '../../shared/money'
import { OTP_MAX, isOtpReady, otpDigits } from '../../shared/otp'
import { cooldownLabel, useCooldown } from '../../shared/useCooldown'
import { appUrl, supabase } from '../../lib/supabase'
import { createEmployee } from '../../services/employees'
import { createOrganization } from '../../services/onboarding'
import { AuthLayout } from './AuthLayout'
import { Illustration, type IllustrationName } from '../../shared/kit/Misc'

/** Название организации до подтверждения почты: письмо уводит из вкладки, черновик должен дожить. */
const DRAFT = 'pvz.onboarding.org'
const readDraft = () => { try { return localStorage.getItem(DRAFT) ?? '' } catch { return '' } }
const saveDraft = (value:string) => { try { localStorage.setItem(DRAFT, value) } catch { /* приватный режим */ } }

const STEPS = {
  1: { title: 'Как называется организация?', sub: 'Это увидят сотрудники в приглашении.' },
  2: { title: 'Первый пункт выдачи', sub: 'Часы работы станут временем смен по умолчанию.' },
  3: { title: 'Первый сотрудник', sub: 'Ставку можно изменить в любой момент — прошлые смены не пересчитаются.' },
} as const

/**
 * Регистрация организации в три шага: организация, первый пункт, первый сотрудник.
 * Первые два шага записываются одним RPC в конце второго: организации без точки в базе
 * не бывает. Третий можно пропустить. График не предлагаем — шаблон «2/2 с сегодня»
 * почти никому не подходит, его составляют в мастере графика.
 *
 * Без сессии первый шаг создаёт аккаунт и проверяет код из письма.
 */
export default function Onboarding({ session, onDone }:{ session:Session | null; onDone:() => Promise<void> }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [info, setInfo] = useState<string>()

  const [organization, setOrganization] = useState(readDraft)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  /** Почта, по которой аккаунт уже есть: предлагаем войти, а не ждать код. */
  const [existing, setExisting] = useState('')
  const cooldown = useCooldown()
  const [code, setCode] = useState('')
  const [pointName, setPointName] = useState('')
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('21:00')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [rate, setRate] = useState('2 000')

  const [pointId, setPointId] = useState<string>()

  const run = async (action:() => Promise<void>) => {
    setBusy(true); setError(undefined)
    try { await action() }
    catch (failure) {
      haptics.error()
      // Ошибки базы приходят объектом `{ code, message }`, а не Error — причину не теряем.
      const message = failure instanceof Error ? failure.message
        : typeof failure === 'object' && failure && 'message' in failure ? String(failure.message) : ''
      setError(message || 'Не получилось — попробуйте ещё раз')
    }
    finally { setBusy(false) }
  }

  const finish = async (message?:string) => {
    try { localStorage.removeItem(DRAFT) } catch { /* приватный режим */ }
    if (message) toastDone(message)
    await onDone()
    // Сразу в задания настройки: там весь путь дальше, а не пустая главная.
    navigate('/home/setup', { replace: true })
  }

  const next = () => run(async () => {
    if (step === 1) {
      saveDraft(organization.trim())
      if (!session) {
        if (!supabase) return
        if (pendingEmail) {
          const result = await supabase.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' })
          if (result.error) throw result.error
          if (!result.data.session) throw new Error('Не удалось подтвердить почту — попробуйте ещё раз')
          setPendingEmail('')
          setCode('')
          setInfo(undefined)
          setStep(2)
          return
        }
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: appUrl('/register') },
        })
        if (result.error) throw result.error
        // Почта уже зарегистрирована и подтверждена: Supabase не шлёт письмо и не говорит
        // об ошибке, а отдаёт пользователя с пустыми identities. Без этой проверки экран
        // обещал бы код, который никогда не придёт.
        if (result.data.user && result.data.user.identities?.length === 0) {
          setExisting(email.trim())
          return
        }
        if (!result.data.session) {
          setPendingEmail(email.trim())
          cooldown.start()
          setInfo(`Отправили код на ${email.trim()}. Введите его в поле выше, чтобы продолжить регистрацию.`)
          return
        }
      }
      setStep(2)
    } else if (step === 2) {
      setPointId(await createOrganization({ name: organization, pointName, hours: { from, to } }))
      setStep(3)
    } else {
      await createEmployee({
        fullName, phone, pickupPointIds: [pointId!],
        paymentType: 'SHIFT', rateKopecks: parseMoney(rate), monthlyNormDays: 22,
      })
      await finish(`${fullName.trim().split(' ')[0]} добавлен. Осталось несколько шагов — они ниже`)
    }
  })

  const skip = () => run(() => finish())

  const resendCode = () => run(async () => {
    if (!supabase || !pendingEmail) return
    const { error: failure } = await supabase.auth.resend({ type: 'signup', email: pendingEmail })
    if (failure) throw failure
    cooldown.start()
    setCode('')
    setInfo(`Новый код отправлен на ${pendingEmail}. Введите его в поле выше.`)
  })

  const valid = {
    1: organization.trim().length >= 2 && (session !== null || (pendingEmail ? isOtpReady(code) : email.includes('@') && password.length >= 6)),
    2: pointName.trim().length > 0 && /^\d\d:\d\d$/.test(from) && /^\d\d:\d\d$/.test(to),
    3: fullName.trim().length > 1 && parseMoney(rate) > 0,
  }[step]
  const visual:Record<1 | 2 | 3, IllustrationName> = { 1: 'pickup-point', 2: 'schedule', 3: 'team' }

  return <AuthLayout>
    <div className="mx-auto mb-3 h-36 w-48"><Illustration name={visual[step]}/></div>
    <div className="mb-5 flex gap-1.5">
      {[1, 2, 3].map(index => <div key={index} className={cn('h-[3px] flex-1 rounded-sm', index <= step ? 'bg-accent' : 'bg-line-strong')}/>)}
    </div>
    <div className="lbl">Шаг {step} из 3</div>
    <div className="mt-2 mb-1.5 text-date leading-[1.15] font-semibold tracking-[-0.025em]">{STEPS[step].title}</div>
    <div className="mb-5 text-row leading-[1.45] text-muted">{STEPS[step].sub}</div>

    {step === 1 && <>
      <TextField label="Название" value={organization} placeholder="ИП Ковалёв А. С." onChange={event => setOrganization(event.target.value)}/>
      {!session && !pendingEmail && <>
        <TextField label="Почта для входа" type="email" inputMode="email" autoComplete="email" placeholder="ivan@pvz.ru" value={email} onChange={event => { setEmail(event.target.value); setExisting('') }}/>
        <TextField label="Пароль" type="password" autoComplete="new-password" hint="Не короче 6 символов" value={password} onChange={event => setPassword(event.target.value)}/>
      </>}
      {!session && pendingEmail && <TextField label="Код из письма" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_MAX} placeholder="000000" value={code} onChange={event => setCode(otpDigits(event.target.value))}/>}
    </>}

    {step === 2 && <>
      <TextField label="Название пункта" value={pointName} placeholder="Ленина 12" onChange={event => setPointName(event.target.value)}/>
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

    {step === 1 && existing && <Card className="mt-3 p-4">
      <div className="text-row font-semibold">По этой почте уже есть аккаунт</div>
      <div className="mt-1 text-sub leading-[1.45] text-muted">
        {existing} уже зарегистрирована. Войдите с паролем — если не помните его, восстановите по коду из письма.
      </div>
      <Button block className="mt-3" onClick={() => navigate('/login', { state: { email: existing } })}>Войти</Button>
      <Button block variant="quiet" className="mt-1" onClick={() => navigate('/login', { state: { email: existing, forgot: true } })}>Забыли пароль?</Button>
    </Card>}

    {info && <div className="mt-3"><Banner tone="info">{info}</Banner></div>}
    {error && <div className="mt-3"><Banner tone="bad">{error}</Banner></div>}

    <Button block className="mt-5" disabled={!valid || busy} onClick={() => void next()}>
      {step === 3 ? 'Готово' : pendingEmail && !session ? 'Подтвердить код' : 'Далее'}
    </Button>
    {step === 1 && pendingEmail && !session && <>
      <Button block variant="quiet" className="mt-1" disabled={busy || cooldown.left > 0} onClick={() => void resendCode()}>
        {cooldown.left > 0 ? `Отправить повторно через ${cooldownLabel(cooldown.left)}` : 'Отправить код повторно'}
      </Button>
      <Button block variant="quiet" className="mt-1" disabled={busy} onClick={() => { setPendingEmail(''); setCode(''); setInfo(undefined); setError(undefined) }}>Изменить почту</Button>
    </>}
    {step === 3 && <Button block variant="quiet" className="mt-1" disabled={busy} onClick={() => void skip()}>
      Пропустить и войти
    </Button>}
    {step === 1 && !session && !pendingEmail && <Button block variant="quiet" className="mt-1" onClick={() => navigate('/login')}>У меня уже есть аккаунт</Button>}
  </AuthLayout>
}
