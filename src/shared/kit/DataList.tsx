import type { ReactNode } from 'react'
import { cn } from './cn'
import { haptics } from './haptics'
import { useLayout } from './layout'
import { List, ListRow, type ListRowProps } from './ListRow'

export interface Column<T> {
  label:string
  /** Дорожка `grid-template-columns`: `minmax(0,2fr)`, `120px`, `auto`. */
  width:string
  /** Суммы — вправо и моноширинным: разряды встают друг под другом. */
  align?:'left' | 'right'
  cell:(row:T) => ReactNode
}

/**
 * Список записей, который на десктопе становится таблицей.
 *
 * Один компонент на обе раскладки, а не две вёрстки в экране: телефонная строка
 * (`row`) и колонки (`columns`) описывают одни и те же данные, и расходиться им негде.
 * В левой колонке master–detail таблица не помещается — там остаются строки.
 */
export function DataList<T>({ rows, rowKey, columns, row, onOpen }:{
  rows:T[]
  rowKey:(item:T) => string
  columns:Column<T>[]
  /** Телефонная строка. */
  row:(item:T) => Omit<ListRowProps, 'onClick'>
  onOpen?:(item:T) => void
}) {
  const { desktop, narrow } = useLayout()

  if (!desktop || narrow) return <List>
    {rows.map(item => <ListRow key={rowKey(item)} {...row(item)} onClick={onOpen && (() => onOpen(item))}/>)}
  </List>

  const template = { gridTemplateColumns: columns.map(column => column.width).join(' ') }
  const cellClass = (column:Column<T>) => cn('min-w-0 truncate', column.align === 'right' && 'text-right font-mono tabular-nums')

  return <div role="table" className="text-sub">
    <div role="row" className="grid gap-4 border-b border-line-soft px-[15px] py-2" style={template}>
      {columns.map(column => <div
        key={column.label}
        role="columnheader"
        className={cn('lbl truncate', column.align === 'right' && 'text-right')}
      >{column.label}</div>)}
    </div>
    <div className="divide-y divide-line-soft">
      {rows.map(item => <div
        key={rowKey(item)}
        role="row"
        tabIndex={onOpen ? 0 : undefined}
        className={cn('grid items-center gap-4 px-[15px] py-2.5', onOpen && 'tap cursor-pointer hover:bg-surface-soft')}
        style={template}
        onClick={onOpen && (() => { haptics.tap(); onOpen(item) })}
        onKeyDown={onOpen && (event => { if (event.key === 'Enter') onOpen(item) })}
      >
        {columns.map(column => <div key={column.label} role="cell" className={cellClass(column)}>{column.cell(item)}</div>)}
      </div>)}
    </div>
  </div>
}
