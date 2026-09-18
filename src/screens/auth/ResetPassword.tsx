import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../shared/kit/Button'
import { Banner, TextField } from '../../shared/kit/Field'
import { toastDone } from '../../shared/kit/Toaster'
import { supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'

/**
 * Новый пароль после ссылки из письма. Ссылка уже вошла в аккаунт — без этого экрана
 * человек оказался бы внутри со старым, забытым паролем, так его и не сменив.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const mismatch = repeat.length > 0 && repeat !== password

  async function save() {
    if (!supabase) return
    setBusy(true); setError(undefined)
    const { error: failure } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (failure) { setError(failure.message); return }
    toastDone('Пароль обновлён')
    navigate('/', { replace: true })
  }

  return <AuthLayout>
    <div className="text-date font-semibold tracking-[-0.025em]">Новый пароль</div>
    <div className="mt-2 mb-5 text-row leading-[1.45] text-muted">Придумайте пароль — дальше вход по нему.</div>
    <TextField label="Пароль" type="password" autoComplete="new-password" hint="Не короче 6 символов" value={password} onChange={event => setPassword(event.target.value)}/>
    <TextField label="Ещё раз" type="password" autoComplete="new-password" error={mismatch ? 'Пароли не совпадают' : undefined} value={repeat} onChange={event => setRepeat(event.target.value)}/>
    {error && <Banner tone="bad">{error}</Banner>}
    <Button block disabled={password.length < 6 || repeat !== password || busy} onClick={() => void save()}>Сохранить пароль</Button>
  </AuthLayout>
}
