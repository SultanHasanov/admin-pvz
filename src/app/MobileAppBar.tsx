import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Button, Typography } from 'antd'
import { ChevronDown, ChevronLeft, RefreshCw } from 'lucide-react'
import { monthLabel } from '../shared/dates'
import { FormModal, SheetFooter } from '../shared/ui'
import { FilterControls } from './Filters'
import { links, primaryTabs, screenTitle } from './navigation'
import { useOrg } from './OrgContext'

type Sheet = 'point' | 'month'

/**
 * Компактная шапка телефона: название экрана, обновление и строка чипов с фильтрами.
 *
 * Чип показывает текущее значение текстом, а список выбора живёт в листе снизу: на 360px
 * два Select заняли бы почти всю ширину и не оставили места под название экрана.
 */
export function MobileAppBar() {
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  const { isModuleEnabled, points, pointId, pointName, month } = useOrg()
  const queryClient = useQueryClient()
  const { message } = AntApp.useApp()
  const fetching = useIsFetching() > 0
  const [sheet, setSheet] = useState<Sheet | null>(null)

  const secondary = useMemo(() => {
    const visible = links.filter(link => !link.module || isModuleEnabled(link.module))
    return !primaryTabs(visible).some(tab => tab.to === pathname)
  }, [isModuleEnabled, pathname])

  // В standalone адресной строки нет: «Ещё → Настройки» нужен видимый выход назад.
  const canGoBack = secondary && key !== 'default'

  function refresh() {
    void queryClient.invalidateQueries()
    message.success('Обновлено')
  }

  return <>
    <header className="appbar">
      {canGoBack && <Button type="text" aria-label="Назад" icon={<ChevronLeft size={22}/>} onClick={() => navigate(-1)}/>}
      <Typography.Text strong className="appbar__title">{screenTitle(pathname)}</Typography.Text>
      <Button
        type="text" aria-label="Обновить данные" onClick={refresh}
        icon={<RefreshCw size={18} className={fetching ? 'is-spinning' : undefined}/>}
      />
    </header>

    <div className="appbar__chips scroll-x">
      {points.length > 1 && <Chip onClick={() => setSheet('point')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>}
      <Chip onClick={() => setSheet('month')}>{monthLabel(month)}</Chip>
    </div>

    {sheet && <FormModal
      title={sheet === 'point' ? 'Пункт выдачи' : 'Месяц'} onClose={() => setSheet(null)}
      footer={<SheetFooter><Button type="primary" onClick={() => setSheet(null)}>Готово</Button></SheetFooter>}
    >
      <FilterControls block only={sheet}/>
    </FormModal>}
  </>
}

function Chip({ children, onClick }:{ children:React.ReactNode; onClick:() => void }) {
  return <button type="button" className="chip" onClick={onClick}>
    <span>{children}</span>
    <ChevronDown size={14}/>
  </button>
}
