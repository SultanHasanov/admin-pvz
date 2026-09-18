import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { TextField } from '../../shared/kit/Field'
import { keys } from '../../services/queries'
import { getTaxSettings, saveTaxSettings } from '../../services/settings'
import { useWrite } from '../../features/write'

/**
 * Ставка налога. Ноль выключает налог: так честнее, чем отдельный переключатель,
 * который можно забыть при ненулевой ставке.
 */
export default function SetTaxSheet({ close }:{ close:() => void }) {
  const tax = useQuery({ queryKey: keys.tax, queryFn: getTaxSettings })
  const [text, setText] = useState<string>()
  const value = text ?? (tax.data ? String(tax.data.enabled ? tax.data.rate : 0) : '')
  const rate = Number(value.replace(',', '.'))
  const valid = value.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 100

  const write = useWrite({
    run: () => saveTaxSettings({ rate, enabled: rate > 0 }),
    invalidate: [keys.tax],
    done: 'Ставка налога обновлена',
    onDone: close,
  })

  return <>
    <TextField
      label="Ставка налога, %"
      inputMode="decimal"
      value={value}
      placeholder="6"
      hint="УСН «доходы» — обычно 6 %. Налог считается с выручки и уменьшает прибыль."
      error={value && !valid ? 'От 0 до 100' : undefined}
      onChange={event => setText(event.target.value)}
    />
    <Button block disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить</Button>
  </>
}
