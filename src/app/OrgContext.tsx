import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ModuleKey, PickupPoint } from '../entities/types'
import { currentMonth } from '../shared/dates'
import { listPickupPoints } from '../services/points'
import { listEnabledModules } from '../services/settings'

interface OrgValue {
  points:PickupPoint[]
  loadingPoints:boolean
  /** Пустая строка — «Все ПВЗ». */
  pointId:string
  setPointId:(value:string) => void
  month:string
  setMonth:(value:string) => void
  pointName:(id:string | null | undefined) => string
  /** ПВЗ, в который пишем новую запись: выбранный или единственный. */
  defaultPointId:string
  modules:ModuleKey[]
  isModuleEnabled:(module:ModuleKey) => boolean
}

const OrgContext = createContext<OrgValue | null>(null)
const stored = (key:string, fallback:string) => { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
const store = (key:string, value:string) => { try { localStorage.setItem(key, value) } catch { /* приватный режим браузера */ } }

export function OrgProvider({ children }:{ children:ReactNode }) {
  const [pointId, setPointIdState] = useState(() => stored('pvz.point', ''))
  const [month, setMonthState] = useState(() => stored('pvz.month', currentMonth()))
  const points = useQuery({ queryKey: ['points'], queryFn: () => listPickupPoints() })
  const modules = useQuery({ queryKey: ['modules'], queryFn: listEnabledModules })

  const setPointId = useCallback((value:string) => { setPointIdState(value); store('pvz.point', value) }, [])
  const setMonth = useCallback((value:string) => { setMonthState(value); store('pvz.month', value) }, [])

  const list = useMemo(() => points.data ?? [], [points.data])
  // Выбранный ПВЗ мог быть архивирован в другой вкладке — не оставляем ссылку на исчезнувшую точку.
  useEffect(() => { if (pointId && list.length && !list.some(p => p.id === pointId)) setPointId('') }, [list, pointId, setPointId])

  const value = useMemo<OrgValue>(() => ({
    points: list,
    loadingPoints: points.isLoading,
    pointId,
    setPointId,
    month,
    setMonth,
    pointName: id => list.find(p => p.id === id)?.name ?? '—',
    defaultPointId: pointId || (list.length === 1 ? list[0].id : ''),
    modules: modules.data ?? [],
    isModuleEnabled: module => !modules.data || modules.data.includes(module),
  }), [list, points.isLoading, pointId, setPointId, month, setMonth, modules.data])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const value = useContext(OrgContext)
  if (!value) throw new Error('useOrg вызван вне OrgProvider')
  return value
}
