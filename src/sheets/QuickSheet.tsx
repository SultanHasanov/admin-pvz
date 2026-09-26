import type { ReactNode } from 'react'
import { ActionTile } from '../shared/kit/Button'
import { c } from '../shared/kit/tokens'
import { IconAdvance, IconDeduction, IconExpense, IconIncome } from '../shared/kit/icons'
import { useSheets, type SheetType } from '../app/sheets'

/**
 * Плюс в правом нижнем углу: четыре действия, которые владелец делает чаще всего.
 * `replace` вместо `open` — плюс не должен оставлять за собой шаг в истории,
 * иначе «Назад» из формы возвращало бы к этому же меню.
 */
export default function QuickSheet() {
  const { replace } = useSheets()

  const actions:{ icon:ReactNode; label:string; tone:{ bg:string; fg:string }; type:SheetType; props?:Record<string, unknown> }[] = [
    { icon: <IconIncome size={18}/>, label: 'Доход', tone: { bg: c.okTint2, fg: c.ok }, type: 'op', props: { kind: 'INCOME' } },
    { icon: <IconExpense size={18}/>, label: 'Расход', tone: { bg: c.badTint2, fg: c.badStrong }, type: 'op', props: { kind: 'EXPENSE' } },
    { icon: <IconDeduction size={18}/>, label: 'Удержание', tone: { bg: c.accentTint, fg: c.accent }, type: 'newDed' },
    { icon: <IconAdvance size={18}/>, label: 'Аванс', tone: { bg: c.infoTint2, fg: c.info }, type: 'payAll', props: { kind: 'ADVANCE' } },
  ]

  return <div className="grid grid-cols-2 gap-2">
    {actions.map(action => <ActionTile
      key={action.label}
      icon={action.icon}
      label={action.label}
      tone={action.tone}
      layout="horizontal"
      onClick={() => replace(action.type, action.props)}
    />)}
  </div>
}
