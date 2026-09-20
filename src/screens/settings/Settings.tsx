import { useQueries } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { rubles } from '../../shared/money'
import { keys } from '../../services/queries'
import { getOrganization } from '../../services/org'
import { getTaxSettings } from '../../services/settings'
import { listSalaryRates } from '../../services/rates'
import { getPayoutSettings } from '../../services/payoutSettings'
import { listExpenseCategories, listRecurringExpenses } from '../../services/finance'
import { listTelegramIntegrations } from '../../services/telegram'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Настройки: то, что владелец задаёт один раз и дальше редко трогает. Справа у каждой
 * строки — текущее значение: чтобы проверить налог, не нужно открывать шторку.
 */
export default function Settings() {
  const { points } = useOrg()
  const { push, back, canBack } = useNav()
  const { open } = useSheets()

  const [organization, tax, rates, payout, categories, recurring, telegram] = useQueries({
    queries: [
      { queryKey: keys.organization, queryFn: getOrganization },
      { queryKey: keys.tax, queryFn: getTaxSettings },
      { queryKey: keys.salaryRates(), queryFn: () => listSalaryRates() },
      { queryKey: keys.payoutSettings, queryFn: getPayoutSettings },
      { queryKey: keys.categories(), queryFn: () => listExpenseCategories() },
      { queryKey: keys.recurring, queryFn: listRecurringExpenses },
      // Интеграции ходят во внешние функции: их сбой не должен ронять экран настроек.
      { queryKey: keys.telegram, queryFn: listTelegramIntegrations, retry: false },
    ],
  })

  const defaultRate = rates.data?.find(rate => rate.isDefault && !rate.archivedAt)
  const botsConnected = (telegram.data ?? []).filter(row => row.status === 'CONNECTED').length

  const groups = [
    {
      label: 'Организация',
      rows: [
        { title: 'Название', right: organization.data?.name ?? '—', onClick: () => open('setOrg') },
        { title: 'Ставка налога', right: tax.data ? (tax.data.enabled ? `${tax.data.rate} %` : 'не считается') : '—', onClick: () => open('setTax') },
        { title: 'Ставка сотрудника по умолчанию', right: defaultRate ? rubles(defaultRate.rateKopecks) : 'не задана', onClick: () => open('setRate') },
        {
          title: 'Дни выплат',
          right: payout.data?.advanceDay && payout.data.payday ? `аванс ${payout.data.advanceDay}, остаток ${payout.data.payday}` : 'не заданы',
          onClick: () => open('setPayDays'),
        },
      ],
    },
    {
      label: 'Справочники',
      rows: [
        { title: 'Категории расходов', right: `${categories.data?.length ?? 0} активных`, onClick: () => push('/money/categories') },
        { title: 'Пункты выдачи', right: `${points.filter(point => !point.archivedAt).length} активных`, onClick: () => push('/more/points') },
        { title: 'Регулярные расходы', right: String((recurring.data ?? []).filter(row => row.active).length), onClick: () => push('/money/recurring') },
      ],
    },
    {
      label: 'Интеграции',
      rows: [
        { title: 'Telegram-боты', right: botsConnected ? `подключено: ${botsConnected}` : 'не подключены', tone: botsConnected ? 'text-ok' : 'text-muted', onClick: () => push('/more/telegram') },
      ],
    },
  ]

  return <Screen header={<Header title="Настройки" onBack={canBack ? back : undefined}/>}>
    {groups.map(group => <div key={group.label}>
      <SectionTitle>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(row => <ListRow
            key={row.title}
            title={row.title}
            right={<span className={'tone' in row ? row.tone : 'text-muted'}>{row.right}</span>}
            chevron
            onClick={row.onClick}
          />)}
        </List>
      </Card>
    </div>)}
  </Screen>
}
