import { createContext, useContext } from 'react'

/**
 * Какой раскладкой рисуется экран. Кит решает сам по этому контексту — экраны передают
 * те же `header`, `filters` и `Fab`, а каркас раскладывает их по топбару на десктопе.
 * Поэтому второй набор экранов под десктоп не нужен, и вторая дизайн-система не появляется.
 *
 * Вне оболочки (стенд `/kit`, вход) контекста нет — там всегда телефонная раскладка.
 */
export interface Layout {
  /** Сайдбар и топбар вместо таб-бара и шапки. */
  desktop:boolean
  /** Экран в левой колонке master–detail: топбар в две строки, списки без таблиц. */
  narrow:boolean
  /** Заголовок топбара для экранов без шапки — название раздела из сайдбара. */
  title?:string
}

export const LayoutContext = createContext<Layout>({ desktop: false, narrow: false })
export const useLayout = () => useContext(LayoutContext)

/**
 * Место в топбаре под главное действие экрана. `Fab` на десктопе порталится сюда:
 * плавающая кнопка над таб-баром на широком экране висела бы посреди пустоты.
 */
export const ActionSlot = createContext<HTMLElement | null>(null)
