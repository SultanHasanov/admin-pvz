import { Button } from '../shared/kit/Button'
import type { SheetPropsMap } from '../app/sheets'

/**
 * Подтверждение необратимого действия. Согласие — первой кнопкой и во всю ширину,
 * отказ — текстом под ней: на телефоне до нижней кнопки палец дотягивается лучше всего,
 * а вероятность промаха по «Отмене» ниже, чем по строке.
 */
export default function ConfirmSheet({ text, yesLabel = 'Да', tone = 'accent', onYes, close }:
SheetPropsMap['confirm'] & { close:() => void }) {
  return <>
    <div className="pb-1 text-row leading-[1.45]">{text}</div>
    <Button
      block
      className="mt-3"
      variant={tone === 'bad' ? 'danger' : 'primary'}
      onClick={() => { close(); onYes() }}
    >{yesLabel}</Button>
    <Button block variant="secondary" className="mt-2" onClick={close}>Отмена</Button>
  </>
}
