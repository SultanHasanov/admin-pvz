import { useState } from 'react'
import { Screen, Header, FilterRow } from '../shared/kit/Screen'
import { Card, Hero, HeroTile, HeroTiles } from '../shared/kit/Card'
import { List, ListRow, Avatar, Dot, Pill } from '../shared/kit/ListRow'
import { SectionTitle, Label, Num } from '../shared/kit/Text'
import { Button, TextButton, ActionTile } from '../shared/kit/Button'
import { Segmented, Stepper } from '../shared/kit/Segmented'
import { TextField, MoneyField, TextArea, Banner } from '../shared/kit/Field'
import { Chip, EmptyState, Illustration, Skeleton, SkeletonRows, ErrorNote } from '../shared/kit/Misc'
import { Fab } from '../shared/kit/TabBar'
import { toastDone, toastError, toastWarn } from '../shared/kit/Toaster'
import { c, tone } from '../shared/kit/tokens'
import { useSheets } from '../app/sheets'
import { useNav } from '../app/nav'
import {
  IconAdvance, IconBox, IconCategory, IconDeduction, IconExpense, IconIncome,
  IconInvite, IconPoint, IconRecurring, IconSchedule, IconSettings, IconTelegram,
  StatusIcon,
} from '../shared/kit/icons'

/**
 * Каталог кита — рабочий стенд дизайн-системы, не часть продукта.
 * Здесь проверяется, что примитивы совпадают с прототипом до того, как из них собраны
 * тридцать экранов: на телефоне это единственный способ увидеть кегли и отбивки рядом.
 * Живёт на /kit и в меню приложения не показывается.
 */
export default function KitCatalogue() {
  const { push } = useNav()
  const { open } = useSheets()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [slots, setSlots] = useState(2)
  const [name, setName] = useState('')
  const [sum, setSum] = useState('2 200')
  const [note, setNote] = useState('')

  return <Screen
    header={<Header title="Каталог кита" bell={{ count: 3, onClick: () => open('menu', { title: 'Уведомления', rows: [{ title: 'Пример строки', onClick: () => {} }] }) }}/>}
    filters={<FilterRow><Chip onClick={() => {}}>Все ПВЗ</Chip><Chip onClick={() => {}} active>Сентябрь</Chip></FilterRow>}
  >
    <Hero
      label="Чистая прибыль · сентябрь"
      value="184 300 ₽"
      note="Доход 551 000 ₽ − расходы, зарплаты, налог и убытки WB"
      onClick={() => push('/kit/metric')}
    >
      <HeroTiles>
        <HeroTile label="Доход" value="551 000 ₽" color={c.tileIncome}/>
        <HeroTile label="Расходы" value="163 000 ₽" color={c.tileExpense}/>
        <HeroTile label="Зарплаты" value="170 600 ₽" color={c.tileSalary}/>
        <HeroTile label="Налог 6%" value="33 060 ₽" color={c.tileTax}/>
      </HeroTiles>
    </Hero>

    <SectionTitle count={4} action={<TextButton onClick={() => {}}>Все</TextButton>}>Строки списка</SectionTitle>
    <Card>
      <List>
        <ListRow
          leading={<Avatar initials="ИС"/>}
          title="Ирина Соколова"
          sub="Ленина 12 · 2 200 ₽"
          right="44 000 ₽"
          rightSub="активен"
          rightSubTone="ok"
          onClick={() => {}}
        />
        <ListRow leading={<Dot tone="bad"/>} align="start" title="Ленина 12: нет сотрудника 19 сент" sub="Пустой день в графике" chevron onClick={() => {}}/>
        <ListRow leading={<Avatar initials="ДО" tone="info"/>} title="Дмитрий Орлов" sub="Ленина 12" pill={{ label: 'отключён', tone: 'neutral' }} onClick={() => {}}/>
        <ListRow title="Смена 09:00–21:00" sub="Мира 5 · место 2" right={<Num>1 100 ₽</Num>}/>
      </List>
    </Card>

    <SectionTitle>Быстрые действия</SectionTitle>
    <div className="grid grid-cols-2 gap-2">
      <ActionTile icon={<IconIncome/>} label="Добавить доход" tone={{ bg: c.okTint2, fg: c.ok }} onClick={() => toastDone('Доход добавлен')}/>
      <ActionTile icon={<IconExpense/>} label="Добавить расход" tone={{ bg: c.badTint2, fg: c.badStrong }} onClick={() => toastWarn('Расход за прошлый месяц')}/>
      <ActionTile icon={<IconDeduction/>} label="Добавить удержание" tone={{ bg: c.accentTint, fg: c.accent }} onClick={() => toastError('Не удалось сохранить')}/>
      <ActionTile icon={<IconAdvance/>} label="Выдать аванс" tone={{ bg: c.infoTint2, fg: c.info }} onClick={() => open('confirm', { text: 'Выдать аванс всем сотрудникам за сентябрь?', yesLabel: 'Выдать', onYes: () => toastDone('Аванс выдан') })}/>
    </div>

    <SectionTitle>Иконки и состояния</SectionTitle>
    <Card className="p-4">
      <div className="flex flex-wrap gap-3">
        <IconBox tone="accent"><IconPoint/></IconBox><IconBox><IconSettings/></IconBox>
        <IconBox tone="info"><IconTelegram/></IconBox><IconBox tone="warn"><IconRecurring/></IconBox>
        <IconBox tone="ok"><IconSchedule/></IconBox><IconBox tone="accent"><IconInvite/></IconBox>
        <IconBox tone="info"><IconCategory/></IconBox>
        <StatusIcon status="done"/><StatusIcon status="warning"/><StatusIcon status="error"/><StatusIcon status="waiting"/><StatusIcon status="locked"/>
      </div>
    </Card>

    <SectionTitle>Управление</SectionTitle>
    <div className="flex items-center gap-3">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }]}
      />
      <div className="flex-1"/>
      <Stepper value={slots} min={1} max={4} onChange={setSlots}/>
    </div>

    <SectionTitle>Пилюли</SectionTitle>
    <div className="flex flex-wrap gap-2">
      {(Object.keys(tone) as (keyof typeof tone)[]).map(key => <Pill key={key} tone={key}>{key}</Pill>)}
    </div>

    <SectionTitle>Поля</SectionTitle>
    <TextField label="ФИО" placeholder="Ирина Соколова" value={name} onChange={event => setName(event.target.value)}/>
    <MoneyField label="Ставка за смену" value={sum} onValueChange={setSum} hint="Запомнено для Ленина 12"/>
    <TextArea label="Комментарий" value={note} onValueChange={setNote} placeholder="Недостача при инвентаризации"/>
    <Banner>Смены до даты изменения считаются по старой ставке — прошлые расчёты не пересчитываются.</Banner>

    <SectionTitle>Кнопки</SectionTitle>
    <div className="flex flex-col gap-2">
      <Button block onClick={() => open('menu', { title: 'Что делаем?', rows: [
        { title: 'Мастер графика', sub: 'Цикл или дни недели', onClick: () => {} },
        { title: 'Применить шаблон', sub: 'Сохранённые графики', onClick: () => {} },
        { title: 'Удалить смену', tone: 'bad', onClick: () => {} },
      ] })}>Открыть меню-шторку</Button>
      <Button block variant="secondary" onClick={() => {}}>Второстепенное действие</Button>
      <Button block variant="danger" onClick={() => {}}>Удалить</Button>
      <Button block variant="quiet" onClick={() => {}}>Позже</Button>
    </div>

    <SectionTitle>Состояния</SectionTitle>
    <Card><SkeletonRows rows={2}/></Card>
    <div className="mt-2 flex gap-2">
      <Skeleton className="h-20 flex-1"/>
      <Skeleton className="h-20 flex-1"/>
    </div>
    <div className="mt-2"><ErrorNote error={new Error('Проверьте соединение')} onRetry={() => {}}/></div>
    <Card className="mt-2">
      <EmptyState
        visual={<Illustration name="finance"/>}
        title="Операций за сентябрь нет"
        sub="Доходы и расходы появятся здесь после первой записи"
        action={<Button onClick={() => {}}>Добавить доход</Button>}
      />
    </Card>

    <SectionTitle>Типографика</SectionTitle>
    <Card className="p-4">
      <Label>Моно-капс подписи</Label>
      <div className="mt-1 text-hero font-semibold tracking-[-0.035em] tabular-nums">184 300 ₽</div>
      <div className="text-lead font-semibold tracking-[-0.025em]">Заголовок экрана 22</div>
      <div className="text-sec font-semibold">Заголовок раздела 15.5</div>
      <div className="text-row font-medium">Строка списка 14.5</div>
      <div className="text-sub text-muted">Подпись под строкой 12.5</div>
      <div className="font-mono text-mono">09:00–21:00</div>
    </Card>

    <Fab onClick={() => open('menu', { rows: [{ title: 'Плавающая кнопка открывает меню', onClick: () => {} }] })}/>
  </Screen>
}
