import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../shared/kit/Button'
import { Banner, TextField } from '../../shared/kit/Field'
import { haptics } from '../../shared/kit/haptics'
import { OTP_MAX, OTP_MIN, otpDigits } from '../../shared/otp'
import { appUrl, supabase } from '../../lib/supabase'
import { AuthLayout, Logo } from './AuthLayout'

/** Supabase отвечает по-английски; человеку нужна причина по-русски. */
function authError(message:string) {
  if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль'
  if (/email not confirmed/i.test(message)) return 'Почта не подтверждена — введите код из письма при регистрации'
  if (/token.*(expired|invalid)|invalid.*token/i.test(message)) return 'Неверный или просроченный код — запросите новый'
  if (/rate limit|too many/i.test(message)) return 'Слишком много попыток — подождите минуту'
  return message
}

/**
 * Вход. Три пути, как в прототипе: войти, зарегистрировать организацию,
 * войти сотрудником по коду приглашения. Плюс восстановление пароля на этом же экране.
 */
export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function signIn() {
    if (!supabase) return
    setBusy(true); setError(undefined)
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (result.error) { haptics.error(); setError(authError(result.error.message)); return }
    // Куда дальше — решает App: владельца на главную, сотрудника в кабинет.
    navigate('/', { replace: true })
  }

  async function sendReset() {
    if (!supabase) return
    setBusy(true); setError(undefined)
    const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset') })
    setBusy(false)
    if (result.error) setError(authError(result.error.message))
    else setMode('sent')
  }

  async function verifyResetCode() {
    if (!supabase) return
    setBusy(true); setError(undefined)
    const result = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' })
    setBusy(false)
    if (result.error) { haptics.error(); setError(authError(result.error.message)); return }
    if (!result.data.session) { setError('Не удалось подтвердить код — попробуйте ещё раз'); return }
    navigate('/reset', { replace: true })
  }

  if (mode === 'sent') return <AuthLayout>
    <div className="text-date font-semibold tracking-[-0.025em]">Проверьте почту</div>
    <div className="mt-2 mb-5 text-row leading-[1.45] text-muted">
      Код для восстановления отправлен на {email.trim()}. Введите его, чтобы задать новый пароль.
    </div>
    <TextField label="Код из письма" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_MAX} placeholder="000000" value={code} onChange={event => setCode(otpDigits(event.target.value))}/>
    {error && <Banner tone="bad">{error}</Banner>}
    <Button block disabled={code.length < OTP_MIN || busy} onClick={() => void verifyResetCode()}>Подтвердить код</Button>
    <Button block variant="quiet" className="mt-1" disabled={busy} onClick={() => { setCode(''); void sendReset() }}>Отправить код повторно</Button>
    <Button block variant="quiet" className="mt-1" onClick={() => setMode('login')}>Вернуться к входу</Button>
  </AuthLayout>

  if (mode === 'forgot') return <AuthLayout>
    <button type="button" className="tap mb-4 text-row text-accent" onClick={() => setMode('login')}>‹ Назад</button>
    <div className="text-date font-semibold tracking-[-0.025em]">Восстановление доступа</div>
    <div className="mt-2 mb-5 text-row leading-[1.45] text-muted">Пришлём код для смены пароля на почту, указанную при регистрации.</div>
    <TextField label="Почта" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/>
    {error && <Banner tone="bad">{error}</Banner>}
    <Button block disabled={!email.includes('@') || busy} onClick={() => void sendReset()}>Отправить код</Button>
  </AuthLayout>

  return <AuthLayout>
    <Logo/>
    <div className="mt-4 text-date font-semibold tracking-[-0.025em]">Пункт</div>
    <div className="mt-1 mb-6 text-row leading-[1.45] text-muted">График, зарплаты и деньги ваших ПВЗ — с телефона.</div>

    <TextField label="Почта" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/>
    <TextField
      label="Пароль"
      type="password"
      autoComplete="current-password"
      value={password}
      onChange={event => setPassword(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && email && password) void signIn() }}
    />
    {error && <Banner tone="bad">{error}</Banner>}

    <Button block disabled={!email.trim() || !password || busy} onClick={() => void signIn()}>Войти</Button>
    <Button block variant="secondary" className="mt-2" onClick={() => navigate('/register')}>Зарегистрировать организацию</Button>
    <Button block variant="quiet" className="mt-1" onClick={() => { setError(undefined); setMode('forgot') }}>Забыли пароль?</Button>

    <div className="my-4 border-t border-line"/>
    <Button block variant="secondary" onClick={() => navigate('/join')}>Я сотрудник, у меня код приглашения</Button>
  </AuthLayout>
}
