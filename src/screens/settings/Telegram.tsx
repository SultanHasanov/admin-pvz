import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Pill } from '../../shared/kit/ListRow'
import { Button } from '../../shared/kit/Button'
import { Banner, TextField } from '../../shared/kit/Field'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { toastDone, toastError } from '../../shared/kit/Toaster'
import { keys, scope } from '../../services/queries'
import {
  connectTelegramBot, disconnectTelegramBot, listTelegramIntegrations,
  type TelegramIntegrationInfo,
} from '../../services/telegram'
import type { PickupPoint } from '../../entities/types'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Telegram-боты: у каждой точки свой бот, и он только пишет в рабочую группу этой точки.
 *
 * Бот ничего не принимает: расходы, удержания и график ведутся в приложении. Один бот
 * на точку — чтобы сообщение о чужих сменах не приходило в чужой чат.
 */
export default function Telegram() {
  const { points } = useOrg()
  const { back, canBack } = useNav()
  const integrations = useQuery({ queryKey: keys.telegram, queryFn: listTelegramIntegrations, retry: false })
  const active = points.filter(point => !point.archivedAt)
  const orphan = integrations.data?.some(row => !row.pickup_point_id)

  return <Screen header={<Header title="Telegram-боты" onBack={canBack ? back : undefined}/>}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Бот присылает в рабочую группу ПВЗ то, что вы включите: кто сегодня на смене, кто выходит завтра
      и в какие дни людей не хватает. Отвечать ему не нужно — всё настраивается здесь.
    </div>

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
  const { push } = useNav()
  const [token, setToken] = useState('')
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.telegram })
    void client.invalidateQueries({ queryKey: scope.telegramBot })
  }
  const onError = (error:Error) => toastError(error.message || 'Telegram не ответил')

  const connect = useMutation({
    mutationFn: () => connectTelegramBot(point.id, token.trim()),
    onSuccess: () => { setToken(''); toastDone(`Бот подключён к ${point.name}`); refresh() },
    onError,
  })
  const disconnect = useMutation({
    mutationFn: () => disconnectTelegramBot(point.id),
    onSuccess: () => { toastDone('Бот отключён'); refresh() },
    onError,
  })

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
        <div className="mt-1 text-sub leading-[1.45] text-muted">
          Осталось добавить бота в рабочую группу «{point.name}» и выбрать, что он туда присылает.
        </div>
        <Button block className="mt-3" onClick={() => push(`/more/telegram/${point.id}`)}>Напоминания в группу</Button>
        <Button
          block
          variant="secondary"
          className="mt-2"
          disabled={disconnect.isPending}
          onClick={() => open('confirm', {
            text: `Отключить бота от ${point.name}? Напоминания в группу перестанут приходить.`,
            yesLabel: 'Отключить',
            tone: 'bad',
            onYes: () => disconnect.mutate(),
          })}
        >Отключить бота</Button>
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
