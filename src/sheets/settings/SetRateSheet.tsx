import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { MoneyField } from '../../shared/kit/Field'
import { moneyInput, parseMoney } from '../../shared/money'
import { keys, scope } from '../../services/queries'
import { listSalaryRates, saveDefaultRate } from '../../services/rates'
import { useWrite } from '../../features/write'

/** Ставка за смену по умолчанию — подставляется новому сотруднику. */
export default function SetRateSheet({ close }:{ close:() => void }) {
  const rates = useQuery({ queryKey: keys.salaryRates(), queryFn: () => listSalaryRates() })
  const current = rates.data?.find(rate => rate.isDefault && !rate.archivedAt)
  const [text, setText] = useState<string>()
  const value = text ?? (current ? moneyInput(current.rateKopecks) : '')
  const kopecks = parseMoney(value)

  const write = useWrite({
    run: () => saveDefaultRate(kopecks),
    invalidate: [scope.salaryRates],
    done: 'Ставка по умолчанию обновлена',
    onDone: close,
  })

  return <>
    <MoneyField
      label="Ставка за смену"
      hint="Подставляется при добавлении нового сотрудника. Ставки уже заведённых не меняются."
      value={value}
      onValueChange={setText}
    />
    <Button block disabled={!(kopecks > 0) || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить</Button>
  </>
}
