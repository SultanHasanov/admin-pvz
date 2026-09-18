import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../shared/kit/Card'
import { Button } from '../shared/kit/Button'
import { Banner } from '../shared/kit/Field'
import { Label } from '../shared/kit/Text'
import { haptics } from '../shared/kit/haptics'
import { supabase } from '../lib/supabase'
import { INVITE_CODE, acceptInvitation, normalizeCode } from '../services/invitations'

/**
 * Вход по приглашению: ссылка `/join/ABC-D3F` или ручной ввод кода.
 *
 * Экран вне оболочки с табами и вне проверки организации — у нового сотрудника её ещё
 * нет. Порядок: код → анонимная сессия → приём приглашения → кабинет `/me`.
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

  /**
   * Сотрудник входит только по коду: без почты и пароля создаём анонимную сессию
   * Supabase и сразу принимаем приглашение — аккаунт привязывается к этому устройству.
   */
  async function enter() {
    if (!supabase) return
    setBusy(true); setMessage(undefined)
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      setBusy(false)
      haptics.error()
      setMessage({ tone: 'bad', text: error.message })
      return
    }
    await join()
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
          <div className="mb-3 text-center text-sub text-muted">Вы вошли как {session.user.email || 'сотрудник'}</div>
          <Button block disabled={!valid || busy} onClick={() => void join()}>Присоединиться</Button>
        </div>
        : <div className="mt-3">
          <Button block disabled={!valid || busy} onClick={() => void enter()}>Войти по коду</Button>
        </div>}
    </div>
  </div>
}
