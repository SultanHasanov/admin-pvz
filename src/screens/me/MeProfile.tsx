import { useQuery } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Avatar } from '../../shared/kit/ListRow'
import { Button } from '../../shared/kit/Button'
import { SkeletonRows } from '../../shared/kit/Misc'
import { initials } from '../../shared/shifts'
import { rubles } from '../../shared/money'
import { today } from '../../shared/dates'
import { rateForDate } from '../../entities/calculations'
import { keys } from '../../services/queries'
import { listSalaryRules } from '../../services/employees'
import { supabase } from '../../lib/supabase'
import { useMe } from '../../features/me/useMe'
import { useOrg } from '../../app/OrgContext'
import { NotLinked } from './NotLinked'

/**
 * Профиль сотрудника: кто я, где работаю, по какой ставке, и выход.
 * Режима демонстрации из прототипа здесь нет — роль задаёт база, а не переключатель.
 */
export default function MeProfile() {
  const { pointName } = useOrg()
  const { employee, employeeId, loading } = useMe()
  const rules = useQuery({ queryKey: keys.salaryRules, queryFn: listSalaryRules })
  const rate = rateForDate((rules.data ?? []).filter(rule => rule.employeeId === employeeId), today())

  const header = <Header title="Профиль"/>
  if (!loading && !employeeId) return <Screen header={header}>
    <NotLinked/>
    <Button block variant="secondary" className="mt-3" onClick={() => void supabase?.auth.signOut()}>Выйти</Button>
  </Screen>

  return <Screen header={header}>
    <Card className="p-4">
      {loading || !employee
        ? <SkeletonRows rows={2}/>
        : <div className="flex items-center gap-3">
          <Avatar initials={initials(employee.fullName)} size={44}/>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lead font-semibold tracking-[-0.02em]">{employee.fullName}</div>
            <div className="mt-0.5 text-sub text-muted">{employee.phone || 'Телефон не указан'}</div>
            <div className="mt-0.5 text-sub text-muted">
              {employee.pickupPointIds.map(id => pointName(id)).join(', ') || 'Без ПВЗ'}
              {rate ? ` · ${rubles(rate.rateKopecks)} / смена` : ''}
            </div>
          </div>
        </div>}
    </Card>

    <div className="mt-3 text-sub leading-[1.45] text-muted">
      Телефон, точки и ставку меняет владелец ПВЗ. Если что-то указано неверно — напишите ему.
    </div>

    <Button block variant="secondary" className="mt-4" onClick={() => void supabase?.auth.signOut()}>Выйти</Button>
  </Screen>
}
