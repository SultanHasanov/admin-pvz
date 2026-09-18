import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow, Pill } from '../../shared/kit/ListRow'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { employeeShare } from '../../entities/calculations'
import { deductionTitles, deductionTones } from '../../shared/deductions'
import { rubles } from '../../shared/money'
import { dayLabel } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listDeductionParts, listMyDisagreements, listVisibleDeductions } from '../../services/deductions'
import { useMe } from '../../features/me/useMe'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'
import { NotLinked } from './NotLinked'

/**
 * Мои удержания WB — все, а не за месяц: спор по удержанию может тянуться дольше месяца.
 *
 * RLS отдаёт сотруднику только его удержания и только его доли, поэтому «разделено с кем»
 * здесь не показать — чужие части ему не видны, и это правильно.
 */
export default function MeDeductions() {
  const { pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const { employeeId, loading: meLoading } = useMe()

  const deductions = useQuery({ queryKey: keys.visibleDeductions, queryFn: () => listVisibleDeductions() })
  const ids = (deductions.data ?? []).map(row => row.id)
  const parts = useQuery({
    queryKey: keys.deductionParts('all', 'mine'),
    queryFn: () => listDeductionParts(ids),
    enabled: !!deductions.data,
  })
  const disagreed = useQuery({
    queryKey: keys.myDisagreements(employeeId ?? ''),
    queryFn: () => listMyDisagreements(employeeId!),
    enabled: !!employeeId,
  })

  const rows = useMemo(() => employeeId
    ? (deductions.data ?? []).map(deduction => ({
      deduction,
      // Спорное удержание в зарплату не идёт, но показать сумму всё равно нужно — полную долю.
      share: employeeShare({ ...deduction, status: 'EMPLOYEE_LIABILITY' }, parts.data ?? [], employeeId),
    })).filter(row => row.share > 0)
    : [], [deductions.data, parts.data, employeeId])

  const header = <Header title="Мои удержания" onBack={canBack ? back : undefined}/>
  if (!meLoading && !employeeId) return <Screen header={header}><NotLinked/></Screen>

  return <Screen header={header}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Из зарплаты вычитаются удержания со статусом «из зарплаты». Если вы не согласны — нажмите на удержание.
    </div>

    {deductions.error && <div className="mb-3"><ErrorNote error={deductions.error}/></div>}

    <Card>
      {deductions.isLoading
        ? <SkeletonRows rows={3}/>
        : !rows.length
          ? <EmptyState title="Удержаний нет" sub="Если WB удержит что-то по вашей смене, оно появится здесь"/>
          : <List>
            {rows.map(({ deduction, share }) => {
              const charged = deduction.status === 'EMPLOYEE_LIABILITY'
              const mine = disagreed.data?.includes(deduction.id)
              return <ListRow
                key={deduction.id}
                title={deduction.reason}
                sub={<>
                  {dayLabel(deduction.eventAt ?? deduction.createdAt)} · {pointName(deduction.pickupPointId)}
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone={deductionTones[deduction.status]}>{deductionTitles[deduction.status]}</Pill>
                    {mine && <Pill tone="warn">Вы не согласны</Pill>}
                  </span>
                </>}
                right={<span className={charged ? 'text-bad-strong' : 'text-muted-soft'}>−{rubles(share)}</span>}
                align="start"
                onClick={() => open('disagree', {
                  id: deduction.id,
                  reason: deduction.reason,
                  amountKopecks: share,
                  date: deduction.eventAt ?? deduction.createdAt,
                })}
              />
            })}
          </List>}
    </Card>
  </Screen>
}
