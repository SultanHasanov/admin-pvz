import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation, type Location } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
import { depthOf, useNav } from './nav'

/** Пружина iOS-перехода: быстрый разгон и мягкая остановка без отката. */
const spring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const

/**
 * Стек экранов с переходами и жестом «назад».
 *
 * Направление берём из глубины в history.state, а не из порядка рендера: переход вперёд
 * сдвигает новый экран справа, «назад» — возвращает его вправо, а смена таба меняет
 * содержимое без сдвига (иначе переключение табов читается как углубление).
 */
export function Stack({ render }:{
  /**
   * Содержимое экрана строится от переданного адреса, а не от контекста router:
   * уходящий экран должен догореть со своим содержимым, а не с содержимым нового.
   */
  render:(location:Location) => ReactNode
}) {
  const location = useLocation()
  const { back } = useNav()
  const reduced = useReducedMotion()
  const depth = depthOf(location.state)
  const previous = useRef(depth)

  const direction = depth > previous.current ? 1 : depth < previous.current ? -1 : 0
  useEffect(() => { previous.current = depth }, [depth])

  // Жест «назад» начинается только от левой кромки — иначе он крадёт горизонтальные
  // прокрутки внутри экрана (ряд чипов, сетка недели).
  const fromEdge = useRef(false)
  const onDragEnd = (_:unknown, info:PanInfo) => {
    if (!fromEdge.current) return
    fromEdge.current = false
    if (info.offset.x > 80 || info.velocity.x > 500) back()
  }

  // Ключ — адрес, а не location.key: открытие шторки добавляет запись в историю с тем же
  // адресом, и по key экран под шторкой перемонтировался бы вместе с потерей прокрутки.
  const screenKey = location.pathname + location.search
  // Пересобираем содержимое только при смене адреса: открытие шторки этого не делает,
  // а уходящий экран сохраняет свой элемент внутри AnimatePresence.
  const content = useMemo(() => render(location), [screenKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (reduced) return <div key={screenKey} className="flex min-h-0 flex-1 flex-col">{content}</div>

  return <AnimatePresence initial={false} mode="popLayout">
    <motion.div
      key={screenKey}
      className="flex min-h-0 flex-1 flex-col bg-bg"
      initial={direction === 0 ? { opacity: 0 } : { x: direction > 0 ? '100%' : '-28%' }}
      animate={{ x: 0, opacity: 1 }}
      exit={direction === 0 ? { opacity: 0 } : { x: direction > 0 ? '-28%' : '100%' }}
      transition={direction === 0 ? { duration: 0.14 } : spring}
      drag={depth > 0 ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.9 }}
      onPointerDownCapture={event => { fromEdge.current = event.clientX < 28 }}
      onDragEnd={onDragEnd}
    >{content}</motion.div>
  </AnimatePresence>
}
