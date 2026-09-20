import { useQuery } from '@tanstack/react-query'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { keys } from '../services/queries'
import { getOrganization, resetOrganizationCache } from '../services/org'
import { supabase } from '../lib/supabase'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { InstallRow } from '../app/InstallRow'

/**
 * «Ещё»: разделы второго плана. Каждая строка — отдельный экран, поэтому список
 * и есть навигация: на телефоне вложенное меню читается хуже, чем плоский перечень.
 */
export default function More() {
  const { push } = useNav()
  const { open } = useSheets()
  const organization = useQuery({ queryKey: keys.organization, queryFn: getOrganization })

  const groups = [
    {
      label: 'Организация',
      rows: [
        { title: 'Пункты выдачи', sub: 'Адреса, часы работы и число сотрудников на смене', to: '/more/points' },
        { title: 'Настройки', sub: 'Налог, ставки, дни выплат', to: '/more/settings' },
      ],
    },
    {
      label: 'Деньги',
      rows: [
        { title: 'Регулярные расходы', sub: 'Аренда, интернет, уборка', to: '/money/recurring' },
        { title: 'Категории расходов', sub: 'Справочник для операций', to: '/money/categories' },
        { title: 'Все операции', sub: 'Журнал доходов и расходов', to: '/money/ops' },
      ],
    },
    {
      label: 'Интеграции',
      rows: [
        { title: 'Кабинет WB ПВЗ', sub: 'Загрузка точек, сотрудников и удержаний', to: '/more/wb' },
        { title: 'Telegram-боты', sub: 'Расходы сообщением в чат', to: '/more/telegram' },
        { title: 'Сверка с WB', sub: 'Что изменилось после загрузки', to: '/money/ded/sync' },
      ],
    },
  ]

  return <Screen header={<Header title="Ещё"/>}>
    {groups.map(group => <div key={group.label}>
      <SectionTitle>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(row => <ListRow
            key={row.to}
            title={row.title}
            sub={row.sub}
            chevron
            align="start"
            onClick={() => push(row.to)}
          />)}
        </List>
      </Card>
    </div>)}

    <SectionTitle>Профиль</SectionTitle>
    <Card>
      <List>
        <ListRow title="Организация" right={organization.data?.name ?? '—'}/>
        <ListRow
          title="Открыть кабинет сотрудника"
          sub="Тот же аккаунт, экраны сотрудника"
          chevron
          align="start"
          onClick={() => push('/me')}
        />
        <InstallRow/>
      </List>
    </Card>

    <Button
      block
      variant="secondary"
      className="mt-3 text-bad-strong"
      onClick={() => open('confirm', {
        text: 'Выйти из приложения?',
        yesLabel: 'Выйти',
        tone: 'bad',
        onYes: () => { resetOrganizationCache(); void supabase?.auth.signOut() },
      })}
    >Выйти</Button>

    <div className="lbl mt-4 text-center">Пункт · {organization.data?.name ?? 'организация'}</div>
  </Screen>
}
