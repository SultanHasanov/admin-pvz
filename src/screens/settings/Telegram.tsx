import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Pill } from '../../shared/kit/ListRow'
import { Button } from '../../shared/kit/Button'
import { Banner, TextField } from '../../shared/kit/Field'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { toastDone, toastError } from '../../shared/kit/Toaster'
import { keys } from '../../services/queries'
import {
  connectTelegramBot, createTelegramPairingCode, disconnectTelegramBot, listTelegramIntegrations,
  type TelegramIntegrationInfo,
} from '../../services/telegram'
import type { PickupPoint } from '../../entities/types'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Telegram-боты. В прототипе один общий бот; в проекте у каждой точки свой — так бот
 * знает, к какому ПВЗ относится сообщение, и не спрашивает об этом в каждом расходе.
 */
export default function Telegram() {
  const { points } = useOrg()
  const { back, canBack } = useNav()
  const integrations = useQuery({ queryKey: keys.telegram, queryFn: listTelegramIntegrations, retry: false })
  const active = points.filter(point => !point.archivedAt)
  const orphan = integrations.data?.some(row => !row.pickup_point_id)

  return <Screen header={<Header title="Telegram-боты" onBack={canBack ? back : undefined}/>}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Расходы и удержания можно добавлять сообщением в бот точки, не открывая приложение.
    </div>
    <Card className="mb-3 px-4 py-3 font-mono text-mono leading-[1.6] text-muted-strong">
      расход аренда 45000<br/>удержание 1400 недостача
    </Card>

    {orphan && <div className="mb-3"><Banner>
      Старого общего бота не удалось привязать к точке: ПВЗ несколько. Подключите отдельного бота для каждого пункта.
    </Banner></div>}

    {integrations.error && <div className="mb-3"><ErrorNote error={integrations.error}/></div>}
    {integrations.isLoading
      ? <Card><SkeletonRows rows={2}/></Card>
      : !active.length
        ? <Card><EmptyState title="Пунктов выдачи нет" sub="Бот подключается к конкретной точке"/></Card>
        : <div className="grid gap-3">
          {active.map(point => <PointBot
            key={point.id}
            point={point}
            integration={integrations.data?.find(row => row.pickup_point_id === point.id)}
          />)}
        </div>}
  </Screen>
}

function PointBot({ point, integration }:{ point:PickupPoint; integration?:TelegramIntegrationInfo }) {
  const client = useQueryClient()
  const { open } = useSheets()
  const [token, setToken] = useState('')
  const [pairing, setPairing] = useState<string>()
  const refresh = () => void client.invalidateQueries({ queryKey: keys.telegram })
  const onError = (error:Error) => toastError(error.message || 'Telegram не ответил')

  const connect = useMutation({
    mutationFn: () => connectTelegramBot(point.id, token.trim()),
    onSuccess: () => { setToken(''); toastDone(`Бот подключён к ${point.name}`); refresh() },
    onError,
  })
  const disconnect = useMutation({
    mutationFn: () => disconnectTelegramBot(point.id),
    onSuccess: () => { setPairing(undefined); toastDone('Бот отключён'); refresh() },
    onError,
  })
  const pair = useMutation({ mutationFn: () => createTelegramPairingCode(point.id), onSuccess: setPairing, onError })

  const connected = integration?.status === 'CONNECTED'

  return <Card className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 truncate text-row font-semibold">{point.name}</div>
      <Pill tone={connected ? 'ok' : integration?.status === 'ERROR' ? 'bad' : 'neutral'}>
        {connected ? `@${integration?.bot_username}` : 'не подключён'}
      </Pill>
    </div>

    {connected
      ? <>
        <div className="mt-1 text-sub leading-[1.45] text-muted">Всё, что написано этому боту, относится только к «{point.name}».</div>
        {pairing && <div className="mt-3 rounded-md bg-surface-soft p-3">
          <div className="text-sub text-muted">Отправьте боту в течение 15 минут:</div>
          <button
            type="button"
            className="tap mt-1 font-mono text-row font-medium"
            onClick={() => void navigator.clipboard?.writeText(`/start ${pairing}`).then(() => toastDone('Команда скопирована'))}
          >/start {pairing}</button>
        </div>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button disabled={pair.isPending} onClick={() => pair.mutate()}>Привязать мой Telegram</Button>
          <Button
            variant="secondary"
            disabled={disconnect.isPending}
            onClick={() => open('confirm', {
              text: `Отключить бота от ${point.name}? Сообщения в него перестанут записываться.`,
              yesLabel: 'Отключить',
              tone: 'bad',
              onYes: () => disconnect.mutate(),
            })}
          >Отключить</Button>
        </div>
      </>
      : <>
        <div className="mt-1 text-sub leading-[1.45] text-muted">
          Создайте бота через @BotFather и вставьте токен. Один токен нельзя использовать для двух ПВЗ.
        </div>
        <TextField
          label="Токен от BotFather"
          type="password"
          autoComplete="off"
          value={token}
          onChange={event => setToken(event.target.value)}
        />
        <Button block disabled={!token.trim() || connect.isPending} onClick={() => connect.mutate()}>Подключить к этому ПВЗ</Button>
      </>}

    {integration?.last_error && <div className="mt-3"><Banner tone="bad">{integration.last_error}</Banner></div>}
  </Card>
}
