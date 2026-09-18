import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import { haptics } from '../shared/kit/haptics'
import { tabRoot, tabOf, roleOf, type TabId } from './tabs'

/**
 * Навигация приложения — стек экранов внутри таба, как в прототипе (`nav`/`back`/`setTab`).
 *
 * Сам стек живёт в history браузера, а не в сторе: только так работают аппаратная «Назад»
 * на Android, deep links из бота и приглашений и восстановление после обновления страницы.
 * В сторе остаётся то, чего history не знает: последний экран каждого таба (чтобы возврат
 * в «Деньги» открывал ту же операцию) и глубина — из неё Stack выводит направление анимации.
 */
interface NavState {
  /** Таб → последний открытый в нём путь. */
  last:Partial<Record<TabId, string>>
  remember(tab:TabId, path:string):void
}

export const useNavStore = create<NavState>(set => ({
  last: {},
  remember: (tab, path) => set(state => ({ last: { ...state.last, [tab]: path } })),
}))

/** Глубина экрана в стеке. Лежит в history.state, поэтому переживает перезагрузку. */
export const depthOf = (state:unknown) =>
  typeof state === 'object' && state !== null && 'depth' in state && typeof state.depth === 'number'
    ? state.depth
    : 0

export function useNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const remember = useNavStore(state => state.remember)
  const last = useNavStore(state => state.last)
  const depth = depthOf(location.state)

  /** Открыть экран поверх текущего. */
  const push = useCallback((to:string) => {
    haptics.tap()
    navigate(to, { state: { depth: depth + 1 } })
  }, [navigate, depth])

  /** Шаг назад по стеку. Если стека нет (открыли по ссылке) — в корень таба. */
  const back = useCallback(() => {
    haptics.tap()
    if (depth > 0) navigate(-1)
    else {
      const role = roleOf(location.pathname)
      navigate(tabRoot(tabOf(location.pathname), role), { replace: true, state: { depth: 0 } })
    }
  }, [navigate, depth, location.pathname])

  /**
   * Переключение таба. Повторный тап по активному табу сбрасывает его стек в корень —
   * привычное поведение нативных приложений и то же, что делает `setTab` в прототипе.
   */
  const setTab = useCallback((tab:TabId) => {
    const role = roleOf(location.pathname)
    const current = tabOf(location.pathname)
    const root = tabRoot(tab, role)
    if (tab === current) {
      navigate(root, { state: { depth: 0 } })
      return
    }
    remember(current, location.pathname + location.search)
    // Запомненный экран берём только если он из этой же роли: после смены роли пути чужие.
    const saved = last[tab]
    navigate(saved?.startsWith(root) ? saved : root, { state: { depth: 0 } })
  }, [navigate, location.pathname, location.search, remember, last])

  return { push, back, setTab, depth, canBack: depth > 0 }
}
