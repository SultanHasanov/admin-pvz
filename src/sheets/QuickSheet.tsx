import { ActionTile } from '../shared/kit/Button'
import { c } from '../shared/kit/tokens'
import { useSheets, type SheetType } from '../app/sheets'

/**
 * Плюс в правом нижнем углу: четыре действия, которые владелец делает чаще всего.
 * `replace` вместо `open` — плюс не должен оставлять за собой шаг в истории,
 * иначе «Назад» из формы возвращало бы к этому же меню.
 */
export default function QuickSheet() {
  const { replace } = useSheets()

  const actions:{ sign:string; label:string; tone:{ bg:string; fg:string }; type:SheetType; props?:Record<string, unknown> }[] = [
    { sign: '+', label: 'Добавить доход', tone: { bg: c.okTint2, fg: c.ok }, type: 'op', props: { kind: 'INCOME' } },
    { sign: '−', label: 'Добавить расход', tone: { bg: c.badTint2, fg: c.badStrong }, type: 'op', props: { kind: 'EXPENSE' } },
    { sign: 'WB', label: 'Добавить удержание', tone: { bg: c.accentTint, fg: c.accent }, type: 'newDed' },
    { sign: '₽', label: 'Выдать аванс', tone: { bg: c.infoTint2, fg: c.info }, type: 'payAll', props: { kind: 'ADVANCE' } },
  ]

  return <div className="grid grid-cols-2 gap-2">
    {actions.map(action => <ActionTile
      key={action.label}
      sign={action.sign}
      label={action.label}
      tone={action.tone}
      onClick={() => replace(action.type, action.props)}
    />)}
  </div>
}
