import { useState, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { SectionTitle } from '../../shared/kit/Text'
import { Button, TextButton } from '../../shared/kit/Button'
import { Checkbox } from '../../shared/kit/Checkbox'
import { Banner, TextField } from '../../shared/kit/Field'
import { Stepper, Segmented } from '../../shared/kit/Segmented'
import { EmptyState, SkeletonRows } from '../../shared/kit/Misc'
import { toastDone, toastError } from '../../shared/kit/Toaster'
import { keys, scope } from '../../services/queries'
import {
  approveTelegramGroup, getTelegramBotSettings, listTelegramGroups, listTelegramIntegrations,
  saveTelegramBotSettings, sendTelegramPreview, unlinkTelegramGroup,
  type ReminderKind, type TelegramBotSettings, type TelegramGroupChat,
} from '../../services/telegram'
import { useWrite } from '../../features/write'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/** Дни недели в нумерации slot_config: от понедельника (0). Та же, что в PointEdit. */
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const DEFAULTS:Omit<TelegramBotSettings, 'integration_id'> = {
  duty_today_enabled: true, duty_today_time: '08:30',
  duty_tomorrow_enabled: true, duty_tomorrow_time: '20:00',
  gaps_enabled: true, gaps_time: '10:00', gaps_horizon_days: 14, gaps_quiet_when_full: true,
  week_enabled: false, week_time: '18:00', week_weekday: 6,
  money_enabled: false, money_time: '21:00',
}

/** `08:30:00` из базы и `08:30` из поля времени — в базу всегда уходит второе. */
const hhmm = (value:string) => value.slice(0, 5)

/**
 * Что бот пишет в рабочую группу ПВЗ и когда.
 *
 * Бот привязан к одной точке, поэтому и группа одна: сообщения о чужих сменах в чате
 * смены — это шум, из-за которого перестают читать и свои.
 */
export default function TelegramBot() {
  const { pointId = '' } = useParams()
  const { points } = useOrg()
  const { back, canBack } = useNav()
  const point = points.find(row => row.id === pointId)
  const integrations = useQuery({ queryKey: keys.telegram, queryFn: listTelegramIntegrations })
  const integration = integrations.data?.find(row => row.pickup_point_id === pointId)
  const header = <Header title="Напоминания" onBack={canBack ? back : undefined}/>

  if (integrations.isLoading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (!point) return <Screen header={header}><Card><EmptyState title="Пункт не найден"/></Card></Screen>
  if (!integration || integration.status !== 'CONNECTED') return <Screen header={header}>
    <Card><EmptyState title="Бот не подключён" sub={`Подключите бота к «${point.name}» на прошлом экране`}/></Card>
  </Screen>

  return <ReminderForm key={integration.id} integrationId={integration.id} pointId={pointId} pointName={point.name} header={header}/>
}

function ReminderForm({ integrationId, pointId, pointName, header }:{
  integrationId:string
  pointId:string
  pointName:string
  header:ReactElement
}) {
  const { open } = useSheets()
  const [testing, setTesting] = useState<ReminderKind>()

  // Список обновляем сам: бота добавляют в группу в другом приложении, и человек ждёт,
  // когда чат появится здесь. Без обновления он видел бы пустой экран и думал, что не вышло.
  const groups = useQuery({
    queryKey: keys.telegramGroups(integrationId),
    queryFn: () => listTelegramGroups(integrationId),
    refetchInterval: 5000,
  })
  const stored = useQuery({ queryKey: keys.telegramSettings(integrationId), queryFn: () => getTelegramBotSettings(integrationId) })

  if (stored.isLoading || groups.isLoading) return <Screen header={header}><Card><SkeletonRows rows={4}/></Card></Screen>

  const chats = groups.data ?? []
  return <Form
    key={integrationId}
    header={header}
    pointId={pointId}
    pointName={pointName}
    integrationId={integrationId}
    initial={stored.data ?? DEFAULTS}
    group={chats.find(chat => chat.approvedAt)}
    candidates={chats.filter(chat => !chat.approvedAt)}
    testing={testing}
    onTesting={setTesting}
    confirm={open}
  />
}

type Confirm = ReturnType<typeof useSheets>['open']

function Form({ header, pointId, pointName, integrationId, initial, group, candidates, testing, onTesting, confirm }:{
  header:ReactElement
  pointId:string
  pointName:string
  integrationId:string
  initial:Omit<TelegramBotSettings, 'integration_id'> | TelegramBotSettings
  /** Подтверждённая группа: туда уходят напоминания. */
  group?:TelegramGroupChat
  /** Чаты, куда бота добавили, но ещё не подтвердили. */
  candidates:TelegramGroupChat[]
  testing?:ReminderKind
  onTesting:(value?:ReminderKind) => void
  confirm:Confirm
}) {
  const [settings, setSettings] = useState<Omit<TelegramBotSettings, 'integration_id'>>({
    duty_today_enabled: initial.duty_today_enabled,
    duty_today_time: hhmm(initial.duty_today_time),
    duty_tomorrow_enabled: initial.duty_tomorrow_enabled,
    duty_tomorrow_time: hhmm(initial.duty_tomorrow_time),
    gaps_enabled: initial.gaps_enabled,
    gaps_time: hhmm(initial.gaps_time),
    gaps_horizon_days: initial.gaps_horizon_days,
    gaps_quiet_when_full: initial.gaps_quiet_when_full,
    week_enabled: initial.week_enabled,
    week_time: hhmm(initial.week_time),
    week_weekday: initial.week_weekday,
    money_enabled: initial.money_enabled,
    money_time: hhmm(initial.money_time),
  })

  const set = <K extends keyof typeof settings>(key:K, value:(typeof settings)[K]) =>
    setSettings(current => ({ ...current, [key]: value }))

  const save = useWrite({
    run: () => saveTelegramBotSettings(integrationId, pointId, settings),
    invalidate: [scope.telegramBot],
    done: 'Напоминания сохранены',
  })

  const approve = useWrite({
    run: (chatId:string) => approveTelegramGroup(chatId),
    invalidate: [scope.telegramBot],
    done: 'Группа подключена',
  })

  const unlink = useWrite({
    run: () => unlinkTelegramGroup(group!.id),
    invalidate: [scope.telegramBot],
    done: 'Группа отключена',
  })

  async function test(kind:ReminderKind) {
    onTesting(kind)
    try { await sendTelegramPreview(pointId, kind); toastDone('Отправил в группу') }
    catch (error) { toastError(error instanceof Error ? error.message : 'Не удалось отправить') }
    finally { onTesting(undefined) }
  }

  const footer = <Button block disabled={save.isPending} onClick={() => save.mutate(undefined as void)}>Сохранить</Button>

  return <Screen header={header} footer={footer}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Бот «{pointName}» пишет напоминания в рабочую группу: кто сегодня на смене и в какие дни людей не хватает.
      Время — местное для этого ПВЗ.
    </div>

    <SectionTitle>Группа</SectionTitle>
    <Card className="p-4">
      {group
        ? <>
          <div className="text-row font-semibold">{group.title || 'Группа подключена'}</div>
          <div className="mt-1 text-sub leading-[1.45] text-muted">
            Напоминания уходят сюда. В группе работают команды /today, /tomorrow, /week и /gaps.
          </div>
          <Button
            variant="secondary"
            className="mt-3"
            block
            disabled={unlink.isPending}
            onClick={() => confirm('confirm', {
              text: 'Отключить группу? Напоминания перестанут приходить, бот останется в чате.',
              yesLabel: 'Отключить',
              tone: 'bad',
              onYes: () => unlink.mutate(undefined as void),
            })}
          >Отключить группу</Button>
        </>
        : candidates.length
          ? <>
            <div className="text-sub leading-[1.5] text-muted">
              Бота добавили в {candidates.length === 1 ? 'эту группу' : 'эти группы'}. Подтвердите ту, куда слать напоминания.
            </div>
            <div className="mt-3 grid gap-2">
              {candidates.map(chat => <div key={chat.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-soft p-3">
                <div className="min-w-0">
                  <div className="truncate text-row font-medium">{chat.title || 'Группа без названия'}</div>
                  <div className="font-mono text-sub text-muted">{chat.telegramChatId}</div>
                </div>
                <Button
                  className="flex-none px-4 py-2 text-act"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(chat.id)}
                >Подключить</Button>
              </div>)}
            </div>
          </>
          : <div className="text-sub leading-[1.5] text-muted">
            Добавьте бота в рабочую группу ПВЗ — чат появится здесь сам, подтвердить его нужно будет кнопкой.
            Если бот уже в группе, напишите там <span className="font-mono">/start</span>.
          </div>}
    </Card>

    {!group && <div className="mt-3"><Banner>
      Пока группа не подтверждена, напоминания никуда не уходят — настройки ниже просто ждут её.
    </Banner></div>}

    <SectionTitle>Что присылать</SectionTitle>

    <Reminder
      title="Кто сегодня на смене"
      sub="Утром в группу: имена, часы и предупреждение, если кого-то не хватает."
      enabled={settings.duty_today_enabled}
      onEnabled={value => set('duty_today_enabled', value)}
      time={settings.duty_today_time}
      onTime={value => set('duty_today_time', value)}
      onTest={group ? () => void test('duty_today') : undefined}
      testing={testing === 'duty_today'}
    />

    <Reminder
      title="Кто выходит завтра"
      sub="Вечером, пока ещё есть время найти замену."
      enabled={settings.duty_tomorrow_enabled}
      onEnabled={value => set('duty_tomorrow_enabled', value)}
      time={settings.duty_tomorrow_time}
      onTime={value => set('duty_tomorrow_time', value)}
      onTest={group ? () => void test('duty_tomorrow') : undefined}
      testing={testing === 'duty_tomorrow'}
    />

    <Reminder
      title="Не хватает людей в графике"
      sub="Дни, где на смене меньше человек, чем нужно точке. Отпуска учитываются."
      enabled={settings.gaps_enabled}
      onEnabled={value => set('gaps_enabled', value)}
      time={settings.gaps_time}
      onTime={value => set('gaps_time', value)}
      onTest={group ? () => void test('gaps') : undefined}
      testing={testing === 'gaps'}
    >
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
        <div className="text-row">Смотреть вперёд</div>
        <Stepper value={settings.gaps_horizon_days} min={1} max={60} suffix=" дн." onChange={value => set('gaps_horizon_days', value)}/>
      </div>
      <Checkbox checked={settings.gaps_quiet_when_full} onChange={value => set('gaps_quiet_when_full', value)}>
        Молчать, когда график закрыт
      </Checkbox>
    </Reminder>

    <Reminder
      title="Расписание на неделю"
      sub="Одним сообщением на семь дней вперёд."
      enabled={settings.week_enabled}
      onEnabled={value => set('week_enabled', value)}
      time={settings.week_time}
      onTime={value => set('week_time', value)}
      onTest={group ? () => void test('week') : undefined}
      testing={testing === 'week'}
    >
      <div className="mt-3 border-t border-line-soft pt-3">
        <div className="mb-2 text-row">В какой день</div>
        <Segmented
          value={String(settings.week_weekday)}
          options={WEEKDAYS.map((label, index) => ({ value: String(index), label }))}
          onChange={value => set('week_weekday', Number(value))}
        />
      </div>
    </Reminder>

    <Reminder
      title="Напомнить про расходы"
      sub="Вечером: что записано за день и просьба внести остальное."
      enabled={settings.money_enabled}
      onEnabled={value => set('money_enabled', value)}
      time={settings.money_time}
      onTime={value => set('money_time', value)}
      onTest={group ? () => void test('money') : undefined}
      testing={testing === 'money'}
    />
  </Screen>
}

/** Одно напоминание: включено ли, во сколько и чем его можно проверить. */
function Reminder({ title, sub, enabled, onEnabled, time, onTime, onTest, testing, children }:{
  title:string
  sub:string
  enabled:boolean
  onEnabled:(value:boolean) => void
  time:string
  onTime:(value:string) => void
  onTest?:() => void
  testing?:boolean
  children?:ReactNode
}) {
  return <Card className="mb-3 p-4">
    <Checkbox checked={enabled} onChange={onEnabled}>
      <span className="font-semibold">{title}</span>
    </Checkbox>
    <div className="mt-1 pl-[32px] text-sub leading-[1.45] text-muted">{sub}</div>
    {enabled && <>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-row">Время</div>
        <div className="w-[136px] [&>div]:mb-0"><TextField type="time" value={time} onChange={event => onTime(event.target.value)}/></div>
      </div>
      {children}
      {onTest && <div className="mt-1 flex justify-end">
        <TextButton onClick={onTest}>{testing ? 'Отправляю…' : 'Отправить сейчас'}</TextButton>
      </div>}
    </>}
  </Card>
}
