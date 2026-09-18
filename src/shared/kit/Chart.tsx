import { useState } from 'react'
import { c } from './tokens'
import { haptics } from './haptics'

/**
 * Доход по дням. Столбики рисуем сами: в прототипе это тридцать полосок по 2px радиуса,
 * и любая библиотека графиков добавит сюда свои оси, отступы и сотню килобайт.
 *
 * Значение показывается тапом строкой над графиком: на телефоне 9-пиксельный столбик
 * пальцем не выбрать, а всплывающая подсказка на тач-экране не открывается вовсе.
 */
export function IncomeChart({ values, month, total, format }:{
  values:number[]
  month:string
  total:string
  format:(value:number) => string
}) {
  const [picked, setPicked] = useState<number>()
  const peak = Math.max(...values, 1)
  const todayIndex = new Date().toISOString().slice(0, 7) === month ? new Date().getDate() - 1 : -1

  return <div className="mt-[9px] rounded-lg border border-line bg-surface p-[15px]">
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <div className="text-sec font-semibold">Доход по дням</div>
      <div className="text-sub text-muted">
        {picked === undefined ? `Всего ${total}` : `${picked + 1} · ${format(values[picked])}`}
      </div>
    </div>

    <div className="flex h-[76px] items-end gap-[2px]">
      {values.map((value, index) => <button
        key={index}
        type="button"
        aria-label={`День ${index + 1}: ${format(value)}`}
        className="min-w-0 flex-1 rounded-t-[2px]"
        style={{
          height: `${Math.max(3, Math.round(value / peak * 100))}%`,
          background: index === todayIndex ? c.ink : value > 0 ? c.chartBar : c.chartEmpty,
          opacity: picked === undefined || picked === index ? 1 : 0.45,
        }}
        onClick={() => { haptics.tap(); setPicked(picked === index ? undefined : index) }}
      />)}
    </div>

    <div className="mt-[7px] flex justify-between font-mono text-axis text-muted">
      <span>1</span>
      <span>{Math.round(values.length / 2)}</span>
      <span>{values.length}</span>
    </div>
  </div>
}
