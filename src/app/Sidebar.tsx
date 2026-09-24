import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../shared/kit/cn'
import { haptics } from '../shared/kit/haptics'
import { useNav } from './nav'
import { subActive, tabOf, tabsFor, type AppRole } from './tabs'

/**
 * Сайдбар десктопа — те же пять разделов, что в таб-баре, и в том же порядке.
 * У активного раздела раскрыты подпункты второго уровня: на широком экране они
 * заменяют путь «Ещё → строка → экран», которым на телефоне добираются до настроек.
 *
 * В узком окне (768–1023px) остаются одни иконки: подпунктов нет, подпись — в `title`.
 */
export function Sidebar({ role, compact }:{ role:AppRole; compact:boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { setTab } = useNav()
  const active = tabOf(location.pathname)

  // Подпункт — верхний уровень на десктопе: без глубины, поэтому и без стрелки «назад».
  const go = (to:string) => { haptics.tap(); navigate(to, { state: { depth: 0 } }) }

  return <nav
    aria-label="Разделы"
    className={cn('flex flex-none flex-col border-r border-line bg-surface', compact ? 'w-[72px] items-center px-2' : 'w-[248px] px-3')}
  >
    <div className={cn('flex items-center gap-2.5 pt-5 pb-6', !compact && 'px-2.5')}>
      <div className="flex size-9 flex-none items-center justify-center rounded-[11px] bg-accent text-row font-semibold text-white">П</div>
      {!compact && <div className="text-title font-semibold tracking-[-0.02em]">Пункт</div>}
    </div>

    <div className="flex flex-col gap-0.5">
      {tabsFor(role).map(tab => {
        const isActive = tab.id === active
        return <div key={tab.id}>
          <button
            type="button"
            title={compact ? tab.label : undefined}
            aria-label={compact ? tab.label : undefined}
            aria-current={isActive ? 'page' : undefined}
            disabled={!tab.root}
            className={cn(
              'tap flex w-full items-center gap-3 rounded-md py-2 text-row font-medium',
              compact ? 'justify-center px-0' : 'px-2.5',
              !tab.root ? 'text-line-strong' : isActive ? 'bg-accent-tint text-accent' : 'text-muted-strong hover:bg-surface-soft',
            )}
            onClick={() => { haptics.tap(); setTab(tab.id) }}
          >
            {tab.icon}
            {!compact && tab.label}
          </button>

          {!compact && isActive && tab.subs && <div className="mt-0.5 mb-1.5 flex flex-col">
            {tab.subs.map(sub => {
              const current = subActive(sub, location.pathname, location.search)
              return <button
                key={sub.to}
                type="button"
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'tap rounded-sm py-1.5 pr-2.5 pl-[46px] text-left text-act',
                  current ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
                )}
                onClick={() => go(sub.to)}
              >{sub.label}</button>
            })}
          </div>}
        </div>
      })}
    </div>
  </nav>
}
