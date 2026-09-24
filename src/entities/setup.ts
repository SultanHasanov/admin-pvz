/**
 * Задания «Настройка пункта» для нового владельца.
 *
 * Выполненность не храним — выводим из данных (`setup_progress` в базе): задание
 * закрывается само, как только появился сотрудник или первый доход, откуда бы он ни пришёл.
 */
export interface SetupProgress {
  points:boolean
  employees:boolean
  defaultRate:boolean
  shifts:boolean
  income:boolean
  expense:boolean
  /** Владелец убрал список с главной. */
  hidden:boolean
}

export type SetupStepId = 'points' | 'employees' | 'defaultRate' | 'shifts' | 'income' | 'expense'

/**
 * `next` — первое невыполненное задание, его показываем крупно с кнопкой.
 * `locked` — пока нельзя: график не из кого составить без сотрудников.
 */
export type SetupStatus = 'done' | 'next' | 'todo' | 'locked'

export interface SetupStepInfo {
  id:SetupStepId
  title:string
  /** Зачем это нужно — одна строка. */
  sub:string
  /** Подпись кнопки у следующего задания. */
  action:string
  /** Без чего задание недоступно. */
  needs?:SetupStepId
  lockedSub?:string
}

export interface SetupStep extends SetupStepInfo {
  status:SetupStatus
}

/** Порядок — рекомендуемый путь: люди → ставка → график → деньги. */
export const SETUP_STEPS:readonly SetupStepInfo[] = [
  { id: 'points', title: 'Создать пункт выдачи', sub: 'Адрес и часы работы', action: 'Добавить пункт' },
  { id: 'employees', title: 'Добавить сотрудников', sub: 'Чтобы строить график и считать зарплаты', action: 'Добавить сотрудника' },
  { id: 'defaultRate', title: 'Задать ставку по умолчанию', sub: 'Подставится новым сотрудникам', action: 'Задать ставку' },
  {
    id: 'shifts', title: 'Составить график', sub: 'Кто и когда работает на пункте', action: 'Составить график',
    needs: 'employees', lockedSub: 'Сначала добавьте сотрудников',
  },
  { id: 'income', title: 'Внести первый доход', sub: 'Выплата маркетплейса или другой доход', action: 'Добавить доход' },
  { id: 'expense', title: 'Внести первый расход', sub: 'Аренда, связь, расходники', action: 'Добавить расход' },
]

export function stepsOf(progress:SetupProgress):SetupStep[] {
  let nextGiven = false
  return SETUP_STEPS.map(step => {
    if (progress[step.id]) return { ...step, status: 'done' as const }
    if (step.needs && !progress[step.needs]) return { ...step, status: 'locked' as const }
    if (nextGiven) return { ...step, status: 'todo' as const }
    nextGiven = true
    return { ...step, status: 'next' as const }
  })
}

export const countDone = (steps:readonly SetupStep[]) => steps.filter(step => step.status === 'done').length

export const nextStep = (steps:readonly SetupStep[]) => steps.find(step => step.status === 'next')
