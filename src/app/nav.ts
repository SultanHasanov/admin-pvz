import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptics } from '../shared/kit/haptics'
import { tabRoot, tabOf, roleOf, type TabId } from './tabs'

/**
 * Навигация приложения — стек экранов внутри таба, как в прототипе (`nav`/`back`/`setTab`).
 *
 * Сам стек живёт в history браузера, а не в сторе: только так работают аппаратная «Назад»
 * на Android, deep links из бота и приглашений и восстановление после обновления страницы.
 * Глубина лежит в history.state — из неё Stack выводит направление анимации.
 */

/** Глубина экрана в стеке. Лежит в history.state, поэтому переживает перезагрузку. */
export const depthOf = (state:unknown) =>
  typeof state === 'object' && state !== null && 'depth' in state && typeof state.depth === 'number'
    ? state.depth
    : 0

export function useNav() {
  const navigate = useNavigate()
  const location = useLocation()
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
   * Переключение таба — всегда в его начало: «Главная» открывает главную, а не экран,
   * на котором из неё ушли. Нажатие на активный таб тоже возвращает в начало.
   */
  const setTab = useCallback((tab:TabId) => {
    navigate(tabRoot(tab, roleOf(location.pathname)), { state: { depth: 0 } })
  }, [navigate, location.pathname])

  return { push, back, setTab, depth, canBack: depth > 0 }
}
