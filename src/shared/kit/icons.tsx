/**
 * Иконки нижней панели. Нарисованы в прототипе и перенесены дословно: lucide в этих
 * размерах даёт другую плотность штриха, и панель перестаёт быть похожа на макет.
 * Цвет наследуется через `currentColor`.
 */

const Svg = ({ children }:{ children:React.ReactNode }) =>
  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" aria-hidden>{children}</svg>

/** Столбики — «Главная»: сводка за месяц. */
export const IconHome = () => <Svg>
  <rect x="2" y="9" width="4.5" height="10" rx="1.4" fill="currentColor"/>
  <rect x="8.2" y="4" width="4.5" height="15" rx="1.4" fill="currentColor"/>
  <rect x="14.4" y="12" width="4.5" height="7" rx="1.4" fill="currentColor"/>
</Svg>

/** Календарь — «График». */
export const IconSchedule = () => <Svg>
  <rect x="2.2" y="4" width="16.6" height="15" rx="3" stroke="currentColor" strokeWidth="1.7"/>
  <path d="M2.2 8.5h16.6" stroke="currentColor" strokeWidth="1.7"/>
  <rect x="5.4" y="11" width="3" height="3" rx="1" fill="currentColor"/>
  <rect x="10.5" y="11" width="3" height="3" rx="1" fill="currentColor"/>
</Svg>

/** Двое — «Люди». */
export const IconPeople = () => <Svg>
  <circle cx="8" cy="7.4" r="3.4" stroke="currentColor" strokeWidth="1.7"/>
  <circle cx="15" cy="8.4" r="2.4" stroke="currentColor" strokeWidth="1.5"/>
  <path d="M2.4 17.6c0-3 2.5-4.6 5.6-4.6s5.6 1.6 5.6 4.6" stroke="currentColor" strokeWidth="1.7"/>
  <path d="M16 13.2c1.6.4 2.7 1.6 2.7 3.4" stroke="currentColor" strokeWidth="1.5"/>
</Svg>

/** Купюра — «Деньги». */
export const IconMoney = () => <Svg>
  <rect x="2" y="5" width="17" height="11.4" rx="2.6" stroke="currentColor" strokeWidth="1.7"/>
  <circle cx="10.5" cy="10.7" r="2.6" stroke="currentColor" strokeWidth="1.5"/>
</Svg>

/** Три точки — «Ещё» у владельца и «Профиль» у сотрудника. */
export const IconMore = () => <Svg>
  <circle cx="4.5" cy="10.5" r="1.9" fill="currentColor"/>
  <circle cx="10.5" cy="10.5" r="1.9" fill="currentColor"/>
  <circle cx="16.5" cy="10.5" r="1.9" fill="currentColor"/>
</Svg>

const turn = { right: 0, down: 90, left: 180, up: 270 } as const

/** Стрелка-уголок: переходы, листание, раскрытие. Толще и крупнее текстовых «›» и «▾». */
export const Chevron = ({ dir = 'right', size = 18 }:{ dir?:keyof typeof turn; size?:number }) =>
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className="flex-none" style={{ transform: `rotate(${turn[dir]}deg)` }}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
