import { Select, Typography } from 'antd'
import { monthLabel, monthOptions } from '../shared/dates'
import { useOrg } from './OrgContext'

/**
 * Фильтры «ПВЗ» и «месяц» действуют на весь продукт.
 * Шапка десктопа и лист телефона делят одни и те же контролы.
 */
export function FilterControls({ block, only }:{
  /** Во всю ширину и с подписями — для листа снизу. */
  block?:boolean
  only?:'point' | 'month'
}) {
  const { points, pointId, setPointId, month, setMonth } = useOrg()

  const pointSelect = points.length > 1 && only !== 'month' && <Select
    key="point" value={pointId} onChange={setPointId} aria-label="Пункт выдачи"
    size={block ? 'large' : undefined} style={block ? { width: '100%' } : { minWidth: 130 }}
    options={[{ value: '', label: 'Все ПВЗ' }, ...points.map(point => ({ value: point.id, label: point.name }))]}
  />

  const monthSelect = only !== 'point' && <Select
    key="month" value={month} onChange={setMonth} aria-label="Месяц"
    size={block ? 'large' : undefined} style={block ? { width: '100%' } : { minWidth: 140 }}
    options={monthOptions().map(value => ({ value, label: monthLabel(value) }))}
  />

  if (!block) return <>{pointSelect}{monthSelect}</>

  return <div className="grid gap-4">
    {pointSelect && <Field label="Пункт выдачи">{pointSelect}</Field>}
    {monthSelect && <Field label="Месяц">{monthSelect}</Field>}
  </div>
}

function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div className="grid gap-1.5">
    <Typography.Text type="secondary" className="text-xs">{label}</Typography.Text>
    {children}
  </div>
}

/** Шапка десктопа: фильтры прижаты вправо и при нехватке места скроллятся. */
export function Filters() {
  return <div className="scroll-x ml-auto flex items-center gap-2"><FilterControls/></div>
}
