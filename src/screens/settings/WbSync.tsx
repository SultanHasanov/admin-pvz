import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow, Pill } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { Button } from '../../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { rubles } from '../../shared/money'
import { dayLabel } from '../../shared/dates'
import { deductionTitles, deductionTones } from '../../shared/deductions'
import { keys, scope } from '../../services/queries'
import { listNewDeductions } from '../../services/deductions'
import { getWbStatus, syncWb } from '../../services/wb'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'

/**
 * Сверка с WB: загрузить свежие данные и посмотреть, что пришло. Сервер отдаёт только
 * счётчики, поэтому здесь итог загрузки и удержания, которые ждут решения, — по каждому
 * владелец дальше решает сам, кто платит.
 */
export default function WbSync() {
  const { pointName } = useOrg()
  const { back, canBack, push } = useNav()
  const client = useQueryClient()
  const status = useQuery({ queryKey: keys.wb, queryFn: getWbStatus, retry: false })
  const fresh = useQuery({ queryKey: keys.newDeductions, queryFn: () => listNewDeductions(10) })

  const sync = useMutation({
    mutationFn: syncWb,
    onSuccess: () => {
      // Загрузка трогает точки, сотрудников и удержания — перечитываем всё это.
      for (const key of [scope.points, scope.employees, scope.deductions, scope.newDeductions, keys.wb]) {
        void client.invalidateQueries({ queryKey: key })
      }
    },
  })

  const connected = status.data?.status === 'CONNECTED'
  const result = sync.data
  const header = <Header title="Сверка с WB" onBack={canBack ? back : undefined}/>

  if (status.isLoading) return <Screen header={header}><Card><SkeletonRows rows={2}/></Card></Screen>

  if (!connected) return <Screen header={header}>
    <Card>
      <EmptyState
        title="Кабинет WB не подключён"
        sub="Без него загрузка недоступна. Удержание можно добавить вручную — через плюс на главной."
        action={<Button onClick={() => push('/more/wb')}>Подключить кабинет</Button>}
      />
    </Card>
  </Screen>

  return <Screen header={header}>
    <Card className="p-4">
      <div className="text-row font-semibold">
        {result ? 'Загружено из кабинета WB' : 'Данные кабинета'}
      </div>
      <div className="mt-1 text-sub text-muted">
        {result
          ? `ПВЗ — ${result.points}, сотрудников — ${result.employees}, удержаний — ${result.deductions}`
          : status.data?.lastSyncAt
            ? `Последнее обновление ${dayjs(status.data.lastSyncAt).format('D MMM, HH:mm').replace('.', '')}`
            : 'Загрузки ещё не было'}
      </div>
      <Button block className="mt-3" disabled={sync.isPending} onClick={() => sync.mutate()}>
        {sync.isPending ? 'Загружаем…' : 'Обновить данные WB'}
      </Button>
      {sync.isPending && <div className="mt-2 text-sub text-muted">WB отвечает медленно — это может занять до минуты.</div>}
    </Card>

    {sync.error && <div className="mt-3"><ErrorNote error={sync.error} onRetry={() => sync.mutate()}/></div>}

    <SectionTitle count={fresh.data?.length}>Ждут решения</SectionTitle>
    <Card>
      {fresh.isLoading
        ? <SkeletonRows rows={2}/>
        : !fresh.data?.length
          ? <EmptyState title="Всё разобрано" sub="Новых удержаний без решения нет"/>
          : <List>
            {fresh.data.map(deduction => <ListRow
              key={deduction.id}
              title={deduction.reason}
              sub={`${pointName(deduction.pickupPointId)} · ${dayLabel(deduction.eventAt ?? deduction.createdAt)}`}
              right={rubles(deduction.amountKopecks)}
              pill={{ label: deductionTitles[deduction.status], tone: deductionTones[deduction.status] }}
              align="start"
              chevron
              onClick={() => push(`/money/ded/${deduction.id}`)}
            />)}
          </List>}
    </Card>
    {result && !result.deductions && <div className="mt-2"><Pill tone="ok">Новых удержаний WB не прислал</Pill></div>}
  </Screen>
}
