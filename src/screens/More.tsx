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
import { useSetup } from '../features/setup/useSetup'
import {
  IconBox, IconBuilding, IconCategory, IconHistory, IconPerson, IconPoint,
  IconRecurring, IconSettings, IconTelegram, IconSchedule,
} from '../shared/kit/icons'

/**
 * «Ещё»: разделы второго плана. Каждая строка — отдельный экран, поэтому список
 * и есть навигация: на телефоне вложенное меню читается хуже, чем плоский перечень.
 */
export default function More() {
  const { push } = useNav()
  const { open } = useSheets()
  const organization = useQuery({ queryKey: keys.organization, queryFn: getOrganization })
  const setup = useSetup()
  // Сюда возвращаются к скрытым с главной заданиям — пока не выполнено всё.
  const setupLeft = !setup.loading && !setup.error && setup.available && setup.done < setup.total

  const groups = [
    {
      label: 'Организация',
      rows: [
        { title: 'Пункты выдачи', sub: 'Адреса, часы работы и число сотрудников на смене', to: '/more/points', icon: <IconPoint/>, tone: 'accent' as const },
        { title: 'Настройки', sub: 'Налог, ставки, дни выплат', to: '/more/settings', icon: <IconSettings/>, tone: 'neutral' as const },
      ],
    },
    {
      label: 'Деньги',
      rows: [
        { title: 'Постоянные расходы', sub: 'Аренда, камеры, уборка — считаются каждый месяц', to: '/money/recurring', icon: <IconRecurring/>, tone: 'warn' as const },
        { title: 'Категории расходов', sub: 'Справочник для операций', to: '/money/categories', icon: <IconCategory/>, tone: 'info' as const },
        { title: 'Все операции', sub: 'Журнал доходов и расходов', to: '/money/ops', icon: <IconHistory/>, tone: 'ok' as const },
      ],
    },
    {
      label: 'Интеграции',
      rows: [
        { title: 'Telegram-боты', sub: 'Напоминания о сменах в рабочую группу', to: '/more/telegram', icon: <IconTelegram/>, tone: 'info' as const },
      ],
    },
  ]

  return <Screen header={<Header title="Ещё"/>}>
    {setupLeft && <Card className="mb-1">
      <ListRow
        leading={<IconBox tone="accent"><IconSchedule/></IconBox>}
        title="Настройка пункта"
        sub="Задания для быстрого старта"
        right={`${setup.done} из ${setup.total}`}
        chevron
        align="start"
        onClick={() => push('/home/setup')}
      />
    </Card>}

    {groups.map(group => <div key={group.label}>
      <SectionTitle>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(row => <ListRow
            key={row.to}
            leading={<IconBox tone={row.tone}>{row.icon}</IconBox>}
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
        <ListRow leading={<IconBox><IconBuilding/></IconBox>} title="Организация" right={organization.data?.name ?? '—'}/>
        <ListRow
          leading={<IconBox tone="accent"><IconPerson/></IconBox>}
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
