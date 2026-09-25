import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PickupPoint } from '../entities/types'
import { currentMonth } from '../shared/dates'
import { listPickupPoints } from '../services/points'
import { keys } from '../services/queries'

interface OrgValue {
  points:PickupPoint[]
  loadingPoints:boolean
  /** Пустая строка — «Все ПВЗ». */
  pointId:string
  setPointId:(value:string) => void
  /** Месяц из шапки: по нему строятся главная, деньги и расчёт. */
  month:string
  /** Выбор месяца в шапке — меняет и `month`, и листаемый месяц графика. */
  setMonth:(value:string) => void
  /**
   * Месяц, который листают стрелками в графике. Отдельно от шапки: пролистать график
   * на май не значит смотреть прибыль за май.
   */
  scheduleMonth:string
  setScheduleMonth:(value:string) => void
  pointName:(id:string | null | undefined) => string
  /** ПВЗ, в который пишем новую запись: выбранный или единственный. */
  defaultPointId:string
  /**
   * Подпись фильтра в шапке. При одной точке — её название, а не «Все ПВЗ»:
   * «все» из одного пункта только сбивают с толку.
   */
  pointTitle:string
}

const OrgContext = createContext<OrgValue | null>(null)
const stored = (key:string, fallback:string) => { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
const store = (key:string, value:string) => { try { localStorage.setItem(key, value) } catch { /* приватный режим браузера */ } }

export function OrgProvider({ children }:{ children:ReactNode }) {
  const [pointId, setPointIdState] = useState(() => stored('pvz.point', ''))
  const [month, setMonthState] = useState(() => stored('pvz.month', currentMonth()))
  const points = useQuery({ queryKey: keys.points, queryFn: () => listPickupPoints() })

  const setPointId = useCallback((value:string) => { setPointIdState(value); store('pvz.point', value) }, [])
  const [scheduleMonth, setScheduleMonth] = useState(month)
  const setMonth = useCallback((value:string) => { setMonthState(value); setScheduleMonth(value); store('pvz.month', value) }, [])

  const list = useMemo(() => points.data ?? [], [points.data])
  // Выбранный ПВЗ мог быть архивирован в другой вкладке — не оставляем ссылку на исчезнувшую точку.
  useEffect(() => { if (pointId && !points.isLoading && !list.some(p => p.id === pointId && !p.archivedAt)) setPointId('') }, [list, pointId, points.isLoading, setPointId])

  const value = useMemo<OrgValue>(() => ({
    points: list,
    loadingPoints: points.isLoading,
    pointId,
    setPointId,
    month,
    setMonth,
    scheduleMonth,
    setScheduleMonth,
    pointName: id => list.find(p => p.id === id)?.name ?? '—',
    defaultPointId: pointId || (list.length === 1 ? list[0].id : ''),
    pointTitle: list.find(p => p.id === (pointId || (list.length === 1 ? list[0].id : '')))?.name ?? 'Все ПВЗ',
  }), [list, points.isLoading, pointId, setPointId, month, setMonth, scheduleMonth])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const value = useContext(OrgContext)
  if (!value) throw new Error('useOrg вызван вне OrgProvider')
  return value
}
