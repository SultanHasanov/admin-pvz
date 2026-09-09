import { useEffect, useState } from 'react'
import { ErrorNote, Field, Title } from '../shared/ui'
import { connectTelegramBot, createTelegramPairingCode, disconnectTelegramBot, getTelegramIntegration, type TelegramIntegrationInfo } from '../services/telegram'

export function TelegramPage() {
  const [integration, setIntegration] = useState<TelegramIntegrationInfo | null>(null)
  const [token, setToken] = useState('')
  const [code, setCode] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [loading, setLoading] = useState(true)

  useEffect(() => { getTelegramIntegration().then(setIntegration).catch(setError).finally(() => setLoading(false)) }, [])

  async function run(action:() => Promise<void>) {
    setLoading(true); setError(undefined)
    try { await action() } catch (failure) { setError(failure) } finally { setLoading(false) }
  }

  const connected = integration?.status === 'CONNECTED'

  return <>
    <Title title="Telegram-бот" subtitle="Быстрый ввод расходов и удержаний с телефона"/>
    <section className="card max-w-2xl p-4 sm:p-6">
      <h2 className="font-semibold">Подключение бота организации</h2>
      <p className="mt-2 text-sm text-slate-500">Token проверяется на сервере, хранится зашифрованным, webhook регистрируется автоматически.</p>

      {connected
        ? <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="font-semibold text-brand-800">@{integration.bot_username} подключён</p>
          <p className="mt-1 text-sm text-brand-700">Бот добавляет удержания и расходы, показывает сотрудников и ближайшие смены.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={loading} onClick={() => void run(async () => setCode(await createTelegramPairingCode()))}>Получить код для /start</button>
            <button className="btn" disabled={loading} onClick={() => void run(async () => { await disconnectTelegramBot(); setIntegration(null); setCode(undefined) })}>Отключить бота</button>
          </div>
        </div>
        : <div className="mt-5">
          <Field label="Token от BotFather"><input type="password" autoComplete="off" className="field" value={token} onChange={e => setToken(e.target.value)} placeholder="123456789:AA..."/></Field>
          <button className="btn btn-primary mt-3 w-full sm:w-auto" disabled={loading || !token.trim()} onClick={() => void run(async () => {
            const result = await connectTelegramBot(token)
            setIntegration({ id: '', status: 'CONNECTED', bot_username: result.bot.username, last_error: null })
            setToken('')
          })}>{loading ? 'Проверяем…' : 'Подключить бота'}</button>
        </div>}

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
        <p className="font-medium">Кнопки бота</p>
        <p className="mt-2 text-slate-600">➕ Удержание · ➕ Расход · 👥 Сотрудники · 📅 Смены</p>
        <p className="mt-2 text-xs text-slate-500">При добавлении расхода бот предложит запомненную сумму для выбранного ПВЗ.</p>
      </div>

      {code && <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm text-brand-800">Отправьте боту это сообщение в течение 15 минут:</p>
        <code className="mt-2 block break-all select-all text-lg font-bold tracking-[.15em] text-brand-700 sm:text-xl sm:tracking-[.2em]">/start {code}</code>
      </div>}

      {integration?.status === 'ERROR' && <p className="mt-3 text-sm text-red-600">{integration.last_error || 'Ошибка подключения Telegram'}</p>}
      <ErrorNote error={error}/>
    </section>
  </>
}
