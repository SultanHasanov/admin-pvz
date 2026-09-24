import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LayoutContext, useLayout } from '../shared/kit/layout'

/**
 * Master–detail на десктопе: список слева, выбранная запись справа.
 *
 * Список не перемонтируется при выборе другой записи: маршруты группы рендерят `Split`
 * в одной и той же позиции дерева, а `Stack` на десктопе держит один ключ на всю группу
 * (`splitGroup`). Правая колонка, наоборот, ключуется адресом — экраны записи
 * рассчитаны на свежий монтаж при смене `:id`, как на телефоне.
 */
export function Split({ master, detail, empty }:{
  master:ReactNode
  detail?:ReactNode
  /** Подсказка в пустой правой колонке, пока ничего не выбрано. */
  empty:string
}) {
  const { pathname } = useLocation()
  const layout = useLayout()

  return <div className="flex min-h-0 flex-1">
    <div className="flex min-h-0 w-[400px] flex-none flex-col border-r border-line">
      <LayoutContext.Provider value={{ ...layout, narrow: true }}>{master}</LayoutContext.Provider>
    </div>
    <div key={detail ? pathname : 'empty'} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {detail ?? <div className="flex flex-1 items-center justify-center px-6 text-center text-sub text-muted">{empty}</div>}
    </div>
  </div>
}

/**
 * Ключ экрана в стеке десктопа. Адреса одной группы master–detail дают один ключ,
 * иначе список слева перемонтировался бы при каждом выборе записи и терял прокрутку.
 */
export function splitGroup(pathname:string, search:string) {
  if (pathname === '/people' || pathname.startsWith('/people/')) return '/people'
  if (pathname === '/more/points' || pathname.startsWith('/more/points/')) return '/more/points'
  if (pathname.startsWith('/money/ded/') && pathname !== '/money/ded/sync') return '/money/ded'
  if (pathname === '/money' && new URLSearchParams(search).get('tab') === 'ded') return '/money/ded'
  return pathname + search
}
