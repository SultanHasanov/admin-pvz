import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Card } from '../shared/kit/Card'
import { List, ListRow, Dot } from '../shared/kit/ListRow'
import { EmptyState } from '../shared/kit/Misc'
import type { FeedItem } from '../entities/notifications'
import { useAlerts } from '../features/home/useAlerts'
import { useMyFeed } from '../features/me/useMyFeed'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { useOrg } from '../app/OrgContext'
import { roleOf } from '../app/tabs'

/**
 * Колокольчик. Лента собирается из того, что уже есть в базе, поэтому отдельного
 * запроса здесь нет — данные те же, что на главной. У владельца и сотрудника ленты
 * разные: одному — что требует решения, другому — что решили про него.
 *
 * Открытие гасит бейдж целиком: пользователь ленту увидел, и держать её горящей,
 * пока он не разберёт каждую строку, значит приучить не смотреть на кружок вовсе.
 */
export default function NotificationsSheet({ close }:{ close:() => void }) {
  const { pathname } = useLocation()
  return roleOf(pathname) === 'employee' ? <EmployeeFeed close={close}/> : <OwnerFeed close={close}/>
}

function Feed({ items, onPick }:{ items:FeedItem[]; onPick:(item:FeedItem) => void }) {
  if (!items.length) return <Card>
    <EmptyState
      title="Пока ничего нового"
      sub="Здесь появятся запросы, удержания и напоминания о выплатах"
    />
  </Card>

  return <Card>
    <List>
      {items.map(item => <ListRow
        key={item.id}
        leading={<Dot tone={item.tone}/>}
        align="start"
        title={item.title}
        sub={item.sub}
        chevron
        onClick={() => onPick(item)}
      />)}
    </List>
  </Card>
}

function OwnerFeed({ close }:{ close:() => void }) {
  const { items, markSeen } = useAlerts()
  const { push } = useNav()
  const { replace } = useSheets()
  const { pointName } = useOrg()

  useEffect(() => { void markSeen() }, [markSeen])

  // Переход закрывает шторку: иначе она останется висеть поверх нового экрана.
  const go = (to:string) => { close(); push(to) }

  return <Feed items={items} onPick={item => {
    if (item.target.kind === 'deduction') go(`/money/ded/${item.target.id}`)
    else if (item.target.kind === 'recurring') go('/money/recurring')
    else if (item.target.kind === 'payout') go(`/money?tab=pay${item.target.advance ? '&adv=1' : ''}`)
    // Заявку и день открываем шторкой на месте: уводить с экрана ради одного
    // решения незачем, а «Назад» вернёт в ленту.
    else if (item.target.kind === 'request') replace('req', { id: item.target.id })
    else if (item.target.kind === 'income') replace('payoutEntry', { pointId: item.target.pointId, periodId: item.target.periodId })
    else if (item.target.kind === 'day') replace('day', { pointId: item.target.pointId, date: item.target.date, pointLabel: pointName(item.target.pointId) })
  }}/>
}

function EmployeeFeed({ close }:{ close:() => void }) {
  const { items, markSeen } = useMyFeed()
  const { push, setTab } = useNav()

  useEffect(() => { void markSeen() }, [markSeen])

  return <Feed items={items} onPick={item => {
    close()
    if (item.target.kind === 'mySched') setTab('sched')
    else if (item.target.kind === 'myMoney') setTab('money')
    else if (item.target.kind === 'myDeductions') push('/me/money/deductions')
  }}/>
}
