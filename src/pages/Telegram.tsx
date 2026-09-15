import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Form, Input, Space, Tag, Typography } from 'antd'
import { ErrorNote, Loading, Title } from '../shared/ui'
import { useOrg } from '../app/OrgContext'
import { connectTelegramBot, createTelegramPairingCode, disconnectTelegramBot, listTelegramIntegrations } from '../services/telegram'

export function TelegramPage() {
  const { points } = useOrg()
  const integrations = useQuery({ queryKey: ['telegram-integrations'], queryFn: listTelegramIntegrations })
  return <>
    <Title title="Telegram-боты" subtitle="Отдельный бот для каждого пункта выдачи"/>
    <Alert className="mb-4" type="info" showIcon message="Бот работает только с данными своего ПВЗ — выбирать точку в каждом действии не нужно."/>
    {integrations.data?.some(item => !item.pickup_point_id) && <Alert className="mb-4" type="warning" showIcon message="Старый бот не удалось привязать автоматически: у организации несколько ПВЗ." description="Отключите старое подключение после миграции и подключите отдельного бота в карточке каждой точки."/>}
    {integrations.isLoading ? <Card><Loading/></Card> : <div className="grid gap-4">
      {points.map(point => <PointBotCard key={point.id} pointId={point.id} pointName={point.name} integration={integrations.data?.find(item => item.pickup_point_id === point.id)}/>) }
    </div>}
    <ErrorNote error={integrations.error}/>
  </>
}

function PointBotCard({ pointId, pointName, integration }:{ pointId:string; pointName:string; integration?:Awaited<ReturnType<typeof listTelegramIntegrations>>[number] }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')
  const [code, setCode] = useState('')
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['telegram-integrations'] })
  const connect = useMutation({ mutationFn: () => connectTelegramBot(pointId, token), onSuccess: () => { setToken(''); refresh() } })
  const disconnect = useMutation({ mutationFn: () => disconnectTelegramBot(pointId), onSuccess: () => { setCode(''); refresh() } })
  const pair = useMutation({ mutationFn: () => createTelegramPairingCode(pointId), onSuccess: setCode })
  const connected = integration?.status === 'CONNECTED'

  return <Card title={pointName} extra={<Tag color={connected ? 'success' : integration?.status === 'ERROR' ? 'error' : 'default'}>{connected ? `@${integration?.bot_username}` : 'Не подключён'}</Tag>}>
    {connected ? <>
      <Typography.Paragraph type="secondary">Все действия в этом боте относятся только к «{pointName}».</Typography.Paragraph>
      <Space wrap>
        <Button type="primary" loading={pair.isPending} onClick={() => pair.mutate()}>Пригласить владельца</Button>
        <Button loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Отключить</Button>
      </Space>
      {code && <Alert className="mt-4" type="info" message="Отправьте боту в течение 15 минут" description={<Typography.Text copyable strong>/start {code}</Typography.Text>}/>
      }
    </> : <Form layout="vertical" requiredMark={false} onFinish={() => connect.mutate()}>
      <Typography.Paragraph type="secondary">Создайте отдельного бота через BotFather и вставьте токен. Один токен нельзя использовать для двух ПВЗ.</Typography.Paragraph>
      <Form.Item label="Token от BotFather"><Input.Password value={token} onChange={event => setToken(event.target.value)} autoComplete="off"/></Form.Item>
      <Button type="primary" htmlType="submit" loading={connect.isPending} disabled={!token.trim()}>Подключить к этому ПВЗ</Button>
    </Form>}
    {integration?.last_error && <Alert className="mt-3" type="error" message={integration.last_error}/>
    }
    <ErrorNote error={connect.error ?? disconnect.error ?? pair.error}/>
  </Card>
}
