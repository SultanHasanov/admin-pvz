import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow } from '../../shared/kit/ListRow'
import { Button } from '../../shared/kit/Button'
import { Banner, TextField } from '../../shared/kit/Field'
import { ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { toastDone, toastError } from '../../shared/kit/Toaster'
import { cn } from '../../shared/kit/cn'
import { formatPhone } from '../../shared/format'
import { keys } from '../../services/queries'
import { confirmWbCode, disconnectWb, getWbStatus, requestWbCode } from '../../services/wb'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Кабинет WB ПВЗ: вход по телефону и коду из SMS, дальше — загрузка пунктов,
 * сотрудников и удержаний.
 *
 * WB — внешняя зависимость без гарантий: вход может сломаться в любой день. Поэтому
 * экран честно показывает ошибку и не блокирует остальное: удержание всегда можно
 * добавить вручную.
 */
export default function WbCabinet() {
  const { back, canBack, push } = useNav()
  const { open } = useSheets()
  const client = useQueryClient()
  const status = useQuery({ queryKey: keys.wb, queryFn: getWbStatus, retry: false })
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeLength, setCodeLength] = useState<number>()

  const refresh = () => void client.invalidateQueries({ queryKey: keys.wb })
  const onError = (error:Error) => toastError(error.message || 'WB не ответил')

  const request = useMutation({
    mutationFn: () => requestWbCode(phone),
    onSuccess: result => { setCodeLength(result.codeLength); toastDone(`Код отправлен на ${phone}`); refresh() },
    onError,
  })
  const confirm = useMutation({
    mutationFn: () => confirmWbCode(code),
    onSuccess: () => { setCode(''); setCodeLength(undefined); toastDone('Кабинет подключён'); refresh() },
    onError,
  })
  const disconnect = useMutation({
    mutationFn: disconnectWb,
    onSuccess: () => { toastDone('Кабинет отключён'); refresh() },
    onError,
  })

  const state = status.data?.status ?? 'NOT_CONNECTED'
  const connected = state === 'CONNECTED'
  // Код уже запрошен: либо в этой сессии экрана, либо раньше (статус в базе).
  const awaitingCode = codeLength !== undefined || state === 'AWAIT_CODE'
  const header = <Header title="Кабинет WB ПВЗ" onBack={canBack ? back : undefined}/>

  if (status.isLoading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>

  return <Screen header={header}>
    {status.error && <div className="mb-3">
      <ErrorNote error={status.error} onRetry={refresh}/>
      <div className="mt-2 text-sub text-muted">Удержания можно добавлять вручную — это не зависит от WB.</div>
    </div>}

    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-ok' : 'bg-bad')}/>
        <div className="text-row font-semibold">{connected ? 'Кабинет подключён' : 'Кабинет не подключён'}</div>
      </div>
      <div className="mt-1 text-sub leading-[1.45] text-muted">
        {connected
          ? 'Удержания, пункты и сотрудники подтягиваются из кабинета WB ПВЗ.'
          : 'Войдите по телефону из кабинета WB ПВЗ — пришлём код в SMS.'}
      </div>

      {connected && <>
        <List className="mt-3 border-t border-line-soft">
          <ListRow title="Телефон" right={status.data?.phoneHint ?? '—'}/>
          <ListRow
            title="Последнее обновление"
            right={status.data?.lastSyncAt ? dayjs(status.data.lastSyncAt).format('D MMM, HH:mm').replace('.', '') : 'ещё не было'}
          />
        </List>
        <Button block className="mt-3" onClick={() => push('/money/ded/sync')}>Обновить данные WB</Button>
        <Button
          block
          variant="secondary"
          className="mt-2"
          disabled={disconnect.isPending}
          onClick={() => open('confirm', {
            text: 'Отключить кабинет WB? Удержания перестанут загружаться автоматически.',
            yesLabel: 'Отключить',
            tone: 'bad',
            onYes: () => disconnect.mutate(),
          })}
        >Отключить кабинет</Button>
      </>}

      {!connected && <div className="mt-4">
        <TextField
          label="Телефон кабинета WB"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 912 000-00-00"
          value={phone}
          onChange={event => setPhone(formatPhone(event.target.value))}
        />
        {awaitingCode && <TextField
          label="Код из SMS"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={codeLength ? `${codeLength} цифры` : 'Код'}
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
        />}
        {awaitingCode
          ? <Button block disabled={!code || confirm.isPending} onClick={() => confirm.mutate()}>Подтвердить код</Button>
          : <Button block disabled={phone.replace(/\D/g, '').length < 11 || request.isPending} onClick={() => request.mutate()}>Получить код</Button>}
        {awaitingCode && <Button block variant="quiet" className="mt-2" disabled={request.isPending} onClick={() => request.mutate()}>
          Отправить код ещё раз
        </Button>}
      </div>}
    </Card>

    {status.data?.lastError && <div className="mt-3"><Banner tone="bad">{status.data.lastError}</Banner></div>}
  </Screen>
}
