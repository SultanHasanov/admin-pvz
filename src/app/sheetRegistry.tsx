import { lazy, Suspense, type ComponentType } from 'react'
import dayjs from 'dayjs'
import { Sheet } from '../shared/kit/Sheet'
import { SkeletonRows } from '../shared/kit/Misc'
import { useSheets, type SheetEntry, type SheetType } from './sheets'

type AnyProps = Record<string, unknown> & { close:() => void }

interface SheetDef {
  /** Заголовок шторки. Считается из параметров: «Новый доход» против «Изменить операцию». */
  title:(props:Record<string, unknown>) => string
  sub?:(props:Record<string, unknown>) => string | undefined
  component:ComponentType<AnyProps>
  /** Обязательный шаг: закрывается только кнопкой внутри. */
  locked?:boolean
}

/** Экраны шторок грузятся по требованию: их 38, и в первый кадр они не нужны. */
const load = (factory:Parameters<typeof lazy>[0]) => lazy(factory) as unknown as ComponentType<AnyProps>

const NotReady = () => <div className="text-row leading-[1.45] text-muted">
  Эта шторка ещё не перенесена из прототипа.
</div>

export const sheetRegistry:Partial<Record<SheetType, SheetDef>> = {
  menu: {
    title: props => (props.title as string) ?? 'Выберите',
    component: load(() => import('../sheets/MenuSheet')),
  },
  confirm: {
    title: () => 'Подтвердите',
    component: load(() => import('../sheets/ConfirmSheet')),
  },
  pvzPick: {
    title: () => 'Пункт выдачи',
    component: load(() => import('../sheets/PvzPickSheet')),
  },
  monthPick: {
    title: () => 'Месяц',
    component: load(() => import('../sheets/MonthPickSheet')),
  },
  notifs: {
    title: () => 'Уведомления',
    component: load(() => import('../sheets/NotificationsSheet')),
  },
  quick: {
    title: () => 'Добавить',
    component: load(() => import('../sheets/QuickSheet')),
  },
  op: {
    title: props => props.entry ? 'Изменить операцию' : props.kind === 'INCOME' ? 'Новый доход' : 'Новый расход',
    component: load(() => import('../sheets/OpSheet')),
  },
  payoutEntry: {
    title: () => 'Выплата',
    component: load(() => import('../sheets/PayoutEntrySheet')),
  },
  payoutMonth: {
    title: () => 'Выплата за месяц',
    component: load(() => import('../sheets/PayoutMonthSheet')),
  },
  newDed: {
    title: () => 'Новое удержание WB',
    component: load(() => import('../sheets/DeductionSheet')),
  },
  status: {
    title: () => 'Статус удержания',
    sub: () => 'От статуса зависит, кто платит',
    component: load(() => import('../sheets/StatusSheet')),
  },
  adj: {
    title: () => 'Премия или штраф',
    component: load(() => import('../sheets/AdjustmentSheet')),
  },
  payout: {
    title: props => props.kind === 'ADVANCE' ? 'Выдать аванс' : 'Выплатить остаток',
    component: load(() => import('../sheets/PayoutSheet')),
  },
  payAll: {
    title: props => props.kind === 'ADVANCE' ? 'Аванс всем' : 'Выплатить всем',
    component: load(() => import('../sheets/PayAllSheet')),
  },
  day: {
    title: props => dayTitle(props.date as string),
    sub: props => props.pointLabel as string | undefined,
    component: load(() => import('../sheets/DaySheet')),
  },
  swap: {
    title: () => 'Замена',
    sub: props => dayTitle(props.date as string),
    component: load(() => import('../sheets/SwapSheet')),
  },
  cand: {
    // Замена по заявке — отдельный вопрос: не «кого поставить», а «кто выйдет вместо».
    title: props => props.requestId ? 'Кто выйдет вместо?' : props.shiftId ? 'Поменять сотрудника' : 'Кого поставить?',
    sub: props => dayTitle(props.date as string),
    component: load(() => import('../sheets/CandidateSheet')),
  },
  partial: {
    title: () => 'Неполный выход',
    component: load(() => import('../sheets/PartialSheet')),
  },
  copyWeek: {
    title: () => 'Скопировать неделю',
    component: load(() => import('../sheets/CopyWeekSheet')),
  },
  req: {
    title: () => 'Заявка сотрудника',
    sub: () => 'Нужно решение',
    component: load(() => import('../sheets/RequestSheet')),
  },
  // Шторки сотрудника: собраны, но кнопки к ним появятся вместе с кабинетом (фаза 6).
  cantWork: {
    title: () => 'Не смогу выйти',
    sub: props => dayTitle(props.date as string),
    component: load(() => import('../sheets/CantWorkSheet')),
  },
  disagree: {
    title: () => 'Не согласен с удержанием',
    component: load(() => import('../sheets/DisagreeSheet')),
  },
  // Настройки (фаза 7)
  setOrg: { title: () => 'Организация', component: load(() => import('../sheets/settings/SetOrgSheet')) },
  setTax: { title: () => 'Ставка налога', component: load(() => import('../sheets/settings/SetTaxSheet')) },
  setRate: { title: () => 'Ставка по умолчанию', component: load(() => import('../sheets/settings/SetRateSheet')) },
  setPayDays: { title: () => 'Дни выплат', component: load(() => import('../sheets/settings/SetPayDaysSheet')) },
  newCat: { title: () => 'Новая категория', component: load(() => import('../sheets/settings/CategorySheet')) },
  renameCat: { title: () => 'Переименовать категорию', component: load(() => import('../sheets/settings/CategorySheet')) },
  newRecur: { title: props => props.cost ? 'Постоянный расход' : 'Новый постоянный расход', component: load(() => import('../sheets/settings/NewRecurSheet')) },
  rate: { title: () => 'Новая ставка', component: load(() => import('../sheets/settings/RateSheet')) },
  pointRate: { title: () => 'Ставка всем на пункте', component: load(() => import('../sheets/settings/PointRateSheet')) },
  split: {
    title: () => 'Кто платит за удержание',
    sub: () => 'Остаток — убыток владельца',
    component: load(() => import('../sheets/SplitSheet')),
  },
}

/** «Пятница, 19 сентября» — заголовок шторки дня. */
function dayTitle(date:string) {
  if (!date) return 'День'
  const parsed = dayjs(date)
  const weekday = parsed.format('dddd')
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${parsed.format('D MMMM')}`
}

/**
 * Показывает верхнюю шторку стека. Одна за раз — как в прототипе: открытие следующей
 * закрывает предыдущую визуально, но шаг в истории остаётся, поэтому «Назад» возвращает
 * к предыдущей шторке, а не к экрану.
 */
export function SheetHost() {
  const { stack, close } = useSheets()
  const entry:SheetEntry | undefined = stack[stack.length - 1]
  const def = entry && sheetRegistry[entry.type]
  const props = entry?.props ?? {}
  const Component = entry ? def?.component ?? NotReady : null

  return <Sheet
    open={!!entry}
    onClose={close}
    dismissible={!def?.locked}
    title={def ? def.title(props) : (entry?.type ?? '')}
    sub={def?.sub?.(props)}
  >
    <Suspense fallback={<SkeletonRows rows={2}/>}>
      {Component && <Component {...props} close={close}/>}
    </Suspense>
  </Sheet>
}
