import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../shared/kit/Card'
import { Button, TextButton } from '../shared/kit/Button'
import { Banner, TextField } from '../shared/kit/Field'
import { Label } from '../shared/kit/Text'
import { haptics } from '../shared/kit/haptics'
import { supabase } from '../lib/supabase'
import { INVITE_CODE, acceptInvitation, normalizeCode } from '../services/invitations'

/**
 * Вход по приглашению: ссылка `/join/ABC-D3F` или ручной ввод кода.
 *
 * Экран вне оболочки с табами и вне проверки организации — у нового сотрудника её ещё
 * нет. Порядок: код → вход или регистрация → приём приглашения → кабинет `/me`.
 * Код держим в адресе, а не в памяти: после подтверждения почты человек вернётся
 * по ссылке из письма, и код должен быть на месте.
 */
export default function Join({ session, onJoined }:{
  session:Session | null
  /** Перечитать членство: после приёма у пользователя появилась организация. */
  onJoined:() => Promise<void>
}) {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [code, setCode] = useState(normalizeCode(params.code ?? ''))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone:'bad' | 'info'; text:string }>()

  const valid = INVITE_CODE.test(code)

  async function join() {
    setBusy(true); setMessage(undefined)
    try {
      await acceptInvitation(code)
      // Роль сменилась: всё, что успели закэшировать до приёма, считалось без доступа.
      queryClient.clear()
      await onJoined()
      haptics.success()
      navigate('/me', { replace: true })
    } catch (error) {
      haptics.error()
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Не удалось принять приглашение' })
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    if (!supabase) return
    setBusy(true); setMessage(undefined)
    const result = register
      ? await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Письмо подтверждения вернёт сюда же — вместе с кодом.
        options: { emailRedirectTo: `${location.origin}/join/${code}` },
      })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (result.error) setMessage({ tone: 'bad', text: result.error.message })
    else if (register && !result.data.session) setMessage({ tone: 'info', text: 'Подтвердите почту по ссылке из письма — она вернёт вас на этот экран' })
    // Сессия появилась — App перерисует экран с кнопкой «Присоединиться».
  }

  return <div className="kit-root grid min-h-dvh place-items-center bg-bg px-4 py-8">
    <div className="w-full max-w-[420px]">
      <div className="mb-5 text-center">
        <div className="text-lead font-semibold tracking-[-0.02em]">Приглашение в «Пункт»</div>
        <div className="mt-1 text-sub text-muted">Код даёт владелец ПВЗ — он же увидит, что вы подключились</div>
      </div>

      <Card className="p-4">
        <Label>Код приглашения</Label>
        <input
          aria-label="Код приглашения"
          className="mt-2 w-full rounded-[13px] border border-line-strong bg-surface px-[15px] py-[14px] text-center font-mono text-code tracking-[0.16em] uppercase"
          value={code}
          placeholder="ABC-D3F"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          inputMode="text"
          onChange={event => setCode(normalizeCode(event.target.value))}
        />
        {code.length === 7 && !valid && <div className="mt-2 text-sub text-bad">В коде нет букв O и I и цифр 0 и 1 — проверьте символы</div>}
      </Card>

      {message && <div className="mt-3"><Banner tone={message.tone}>{message.text}</Banner></div>}

      {session
        ? <div className="mt-3">
          <div className="mb-3 text-center text-sub text-muted">Вы вошли как {session.user.email}</div>
          <Button block disabled={!valid || busy} onClick={() => void join()}>Присоединиться</Button>
        </div>
        : <Card className="mt-3 p-4">
          <div className="mb-3 text-row font-medium">{register ? 'Создайте аккаунт' : 'Войдите в аккаунт'}</div>
          <TextField label="Почта" type="email" autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)}/>
          <TextField
            label="Пароль"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            hint={register ? 'Не короче 6 символов' : undefined}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          <Button block disabled={!valid || !email.trim() || password.length < 6 || busy} onClick={() => void signIn()}>
            {register ? 'Создать аккаунт' : 'Войти'}
          </Button>
          <div className="mt-3 text-center">
            <TextButton onClick={() => setRegister(!register)}>
              {register ? 'Уже есть аккаунт' : 'Создать аккаунт'}
            </TextButton>
          </div>
        </Card>}
    </div>
  </div>
}
