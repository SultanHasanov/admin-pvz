import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { Card } from '../../shared/kit/Card'
import { Switch } from '../../shared/kit/Switch'
import { Stepper } from '../../shared/kit/Segmented'
import { SkeletonRows } from '../../shared/kit/Misc'
import { Banner } from '../../shared/kit/Field'
import { keys, scope } from '../../services/queries'
import { getIncomeSchedule, normalizeIncomeSchedule, saveIncomeSchedule } from '../../services/incomeSchedule'
import { useWrite } from '../../features/write'

export default function SetIncomeScheduleSheet({ close }:{ close:() => void }) {
  const query = useQuery({ queryKey: keys.incomeSchedule, queryFn: getIncomeSchedule })
  const [weekly, setWeekly] = useState(true)
  const [custom, setCustom] = useState(false)
  const [days, setDays] = useState([10, 25])
  useEffect(() => {
    if (!query.data) return
    setWeekly(query.data.weeklyEnabled); setCustom(query.data.customEnabled); setDays(query.data.customDays)
  }, [query.data])

  let error = ''
  try { normalizeIncomeSchedule({ weeklyEnabled: weekly, customEnabled: custom, customDays: days }) }
  catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте настройки' }

  const write = useWrite({
    run: () => saveIncomeSchedule({ weeklyEnabled: weekly, customEnabled: custom, customDays: days }),
    invalidate: [scope.incomeSchedule, scope.transactions],
    done: 'График доходов сохранён', onDone: close,
  })
  if (query.isPending) return <Card><SkeletonRows rows={4}/></Card>

  const toggle = (kind:'weekly'|'custom', value:boolean) => {
    if (!value && (kind === 'weekly' ? !custom : !weekly)) return
    if (kind === 'weekly') setWeekly(value); else setCustom(value)
  }
  const setCount = (count:number) => setDays(current => count === 3 ? [...current.slice(0, 2), current[2] ?? 31] : current.slice(0, 2))
  const setDay = (index:number, value:number) => setDays(current => current.map((day, i) => i === index ? value : day))

  return <>
    <Card className="mb-3 px-[15px]">
      <div className="flex items-center gap-3 border-b border-line-soft py-3">
        <div className="min-w-0 flex-1"><div className="text-row font-medium">По неделям</div><div className="text-sub text-muted">Каждый понедельник за прошлую неделю</div></div>
        <Switch checked={weekly} disabled={weekly && !custom} onChange={value => toggle('weekly', value)} label="Вводить доход по неделям"/>
      </div>
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1"><div className="text-row font-medium">По датам</div><div className="text-sub text-muted">Два или три раза в месяц</div></div>
        <Switch checked={custom} disabled={custom && !weekly} onChange={value => toggle('custom', value)} label="Вводить доход по датам"/>
      </div>
    </Card>

    {custom && <Card className="mb-3 p-[15px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><div className="text-row font-medium">Выплат в месяц</div><div className="text-sub text-muted">Выберите 2 или 3</div></div>
        <Stepper value={days.length} min={2} max={3} onChange={setCount}/>
      </div>
      {days.map((day, index) => <div key={index} className="flex items-center justify-between gap-3 border-t border-line-soft py-3">
        <span className="text-row">{index + 1}-я выплата</span>
        <Stepper value={day} min={1} max={31} suffix="число" onChange={value => setDay(index, value)}/>
      </div>)}
    </Card>}
    {error && <Banner tone="bad">{error}</Banner>}
    <Button block disabled={!!error || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить</Button>
  </>
}
