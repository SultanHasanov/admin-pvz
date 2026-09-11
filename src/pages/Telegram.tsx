import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd'
import { ErrorNote, Title } from '../shared/ui'
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
    <Card variant="outlined" title="Подключение бота организации" style={{ maxWidth: 720 }}>
      <Typography.Paragraph type="secondary">
        Token проверяется на сервере, хранится зашифрованным, webhook регистрируется автоматически.
      </Typography.Paragraph>

      {connected
        ? <Alert
          type="success" showIcon
          message={`@${integration.bot_username} подключён`}
          description={<>
            <Typography.Paragraph style={{ marginBottom: 12 }}>
              Бот добавляет удержания и расходы, показывает сотрудников и ближайшие смены.
            </Typography.Paragraph>
            <Space wrap>
              <Button type="primary" loading={loading} onClick={() => void run(async () => setCode(await createTelegramPairingCode()))}>
                Получить код для /start
              </Button>
              <Button loading={loading} onClick={() => void run(async () => { await disconnectTelegramBot(); setIntegration(null); setCode(undefined) })}>
                Отключить бота
              </Button>
            </Space>
          </>}
        />
        : <Form layout="vertical" requiredMark={false}>
          <Form.Item label="Token от BotFather">
            <Input.Password autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="123456789:AA..."/>
          </Form.Item>
          <Button
            type="primary" loading={loading} disabled={!token.trim()}
            onClick={() => void run(async () => {
              const result = await connectTelegramBot(token)
              setIntegration({ id: '', status: 'CONNECTED', bot_username: result.bot.username, last_error: null })
              setToken('')
            })}
          >Подключить бота</Button>
        </Form>}

      <Card size="small" className="mt-5" style={{ background: '#fafafa' }}>
        <Typography.Text strong>Кнопки бота</Typography.Text>
        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 4 }}>➕ Удержание · ➕ Расход · 👥 Сотрудники · 📅 Смены</Typography.Paragraph>
        <Typography.Text type="secondary" className="text-xs">
          При добавлении расхода бот предложит запомненную сумму для выбранного ПВЗ.
        </Typography.Text>
      </Card>

      {code && <Alert
        className="mt-5" type="info"
        message="Отправьте боту это сообщение в течение 15 минут:"
        description={<Typography.Text copyable strong className="select-all break-all text-lg tracking-widest">/start {code}</Typography.Text>}
      />}

      {integration?.status === 'ERROR' && <Alert
        className="mt-3" type="error" showIcon
        message={integration.last_error || 'Ошибка подключения Telegram'}
      />}
      <ErrorNote error={error}/>
    </Card>
  </>
}
