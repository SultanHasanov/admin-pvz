import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { create } from 'zustand'

/**
 * Типы шторок прототипа. Держим полным списком: по нему собран реестр и видно,
 * что ещё не реализовано.
 */
export type SheetType =
  // выбор и навигация
  | 'pvzPick' | 'monthPick' | 'datePick' | 'menu' | 'confirm' | 'notifs' | 'quick' | 'role'
  // деньги
  | 'op' | 'payout' | 'payAll' | 'adj' | 'newDed' | 'status' | 'disagree' | 'newRecur' | 'newCat' | 'renameCat'
  // Деления удержания в прототипе нет — части там только в сид-данных. Без шторки
  // таблицу частей нечем наполнить, поэтому она добавлена сверх 38 прототипных.
  | 'split'
  // график
  | 'day' | 'dayAll' | 'cand' | 'selAssign' | 'partial' | 'copyWeek' | 'saveTpl'
  // люди и заявки
  | 'rate' | 'req' | 'cantWork'
  // настройки
  | 'setOrg' | 'setTax' | 'setRate' | 'setPayDays'

/**
 * Параметры шторок. Карта растёт по мере появления шторок; у ещё не описанных
 * тип параметров свободный, поэтому реестр можно наполнять постепенно.
 */
export interface SheetPropsMap {
  menu:{ rows:{ title:string; sub?:string; tone?:'accent' | 'bad'; onClick():void }[]; title?:string }
  confirm:{
    text:string
    yesLabel?:string
    tone?:'accent' | 'bad'
    onYes():void
  }
}

export type SheetProps<K extends SheetType> = K extends keyof SheetPropsMap
  ? SheetPropsMap[K]
  : Record<string, unknown>

export interface SheetEntry {
  type:SheetType
  props?:Record<string, unknown>
}

interface SheetsStore {
  stack:SheetEntry[]
  set(stack:SheetEntry[]):void
}

const useStore = create<SheetsStore>(set => ({
  stack: [],
  set: stack => set({ stack }),
}))

/** Верхняя шторка прямо сейчас, без ожидания рендера. */
export const currentTopSheet = () => useStore.getState().stack.at(-1)

const sheetDepthOf = (state:unknown) =>
  typeof state === 'object' && state !== null && 'sheetDepth' in state && typeof state.sheetDepth === 'number'
    ? state.sheetDepth
    : 0

/**
 * Шторки — состояние, а не маршрут: их 38, они вкладываются друг в друга
 * («день» → «кого поставить» → «подтвердите») и принимают объекты в параметрах.
 *
 * При этом каждое открытие добавляет запись в history с тем же адресом и увеличенным
 * `sheetDepth`. Так аппаратная «Назад» на Android закрывает верхнюю шторку, а не уводит
 * с экрана, и при этом router остаётся в курсе истории — своих `pushState` мы не делаем.
 * Адрес не меняется, поэтому Stack не перерисовывает экран под шторкой.
 */
export function useSheets() {
  const stack = useStore(state => state.stack)
  const setStack = useStore(state => state.set)
  const navigate = useNavigate()
  const location = useLocation()
  const depth = sheetDepthOf(location.state)
  const here = location.pathname + location.search

  // История — источник правды: после «Назад» глубина уменьшилась, и стек подрезается.
  // Режем только при уменьшении глубины: навигация идёт в transition и коммитится позже
  // стора, поэтому в промежуточном кадре depth < stack.length — это не «Назад».
  const previousDepth = useRef(depth)
  useEffect(() => {
    const decreased = depth < previousDepth.current
    previousDepth.current = depth
    if (decreased && depth < useStore.getState().stack.length) setStack(useStore.getState().stack.slice(0, depth))
  }, [depth, setStack])

  const open = useCallback(<K extends SheetType>(type:K, props?:SheetProps<K>) => {
    const current = useStore.getState().stack
    // Пункт меню подменяет само меню: иначе «закрыть меню» и «открыть шторку» гоняются в истории.
    if (current[current.length - 1]?.type === 'menu') {
      setStack([...current.slice(0, -1), { type, props }])
      return
    }
    setStack([...current, { type, props }])
    navigate(here, { state: { ...(location.state as object), sheetDepth: current.length + 1 } })
  }, [navigate, here, location.state, setStack])

  /** Заменить верхнюю шторку, не добавляя шаг в историю: «выбрать» → «подтвердить». */
  const replace = useCallback(<K extends SheetType>(type:K, props?:SheetProps<K>) => {
    const current = useStore.getState().stack
    setStack([...current.slice(0, -1), { type, props }])
  }, [setStack])

  const close = useCallback(() => { if (depth > 0) navigate(-1) }, [navigate, depth])
  const closeAll = useCallback(() => { if (depth > 0) navigate(-depth) }, [navigate, depth])

  return { stack, top: stack[stack.length - 1], open, replace, close, closeAll }
}
