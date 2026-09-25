import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Screen, FilterRow } from '../shared/kit/Screen'
import { Card, Hero } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { Segmented } from '../shared/kit/Segmented'
import { DataList } from '../shared/kit/DataList'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { Fab } from '../shared/kit/TabBar'
import type { Tone } from '../shared/kit/tokens'
import type { DeductionStatus } from '../entities/types'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { dayLabel, monthLabel } from '../shared/dates'
import { deductionStage, type DeductionStage } from '../shared/deductions'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

type Tab = 'fin' | 'pay' | 'ded'

const deductionTone:Record<DeductionStatus, Tone> = {
  NEW: 'warn', INVESTIGATING: 'warn', DISPUTED: 'info', PENDING: 'warn',
  CANCELLED_BY_WB: 'ok', CONFIRMED_BY_WB: 'bad', EMPLOYEE_LIABILITY: 'accent', OWNER_LOSS: 'bad',
}
const deductionTitles:Record<DeductionStatus, string> = {
  NEW: 'новое', INVESTIGATING: 'разбираемся', DISPUTED: 'оспаривается', PENDING: 'ожидает',
  CANCELLED_BY_WB: 'отменено WB', CONFIRMED_BY_WB: 'подтверждено WB',
  EMPLOYEE_LIABILITY: 'из зарплаты', OWNER_LOSS: 'убыток владельца',
}

/**
 * Деньги: три вкладки одного раздела — операции, ведомость и удержания WB.
 * Вкладка живёт в адресе (?tab=), чтобы ссылка из уведомления открывала нужную.
 */
export default function Money({ tab: pinned }:{
  /**
   * Десктоп: список удержаний слева от карточки удержания. Адрес там — карточки,
   * поэтому вкладка берётся отсюда, а смена вкладки уводит обратно на `/money`.
   */
  tab?:Tab
} = {}) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = pinned ?? (params.get('tab') as Tab) ?? 'fin'
  const { id: selected } = useParams()
  const { month, pointId, pointName, pointTitle } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)

  const period = monthLabel(month).split(' ')[0]

  const setTab = (next:Tab) => pinned ? navigate(`/money?tab=${next}`, { state: { depth: 0 } }) : setParams(current => {
    const copy = new URLSearchParams(current)
    copy.set('tab', next)
    return copy
  }, { replace: true })

  return <Screen
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointTitle}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
    </FilterRow>}
  >
    <Segmented
      className="mb-3"
      value={tab}
      onChange={setTab}
      options={[{ value: 'fin', label: 'Операции' }, { value: 'pay', label: 'Зарплаты' }, { value: 'ded', label: 'Удержания' }]}
    />

    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}
    {totals.loading && <Card><SkeletonRows rows={4}/></Card>}

    {!totals.loading && tab === 'fin' && <FinanceTab totals={totals} period={period} pointName={pointName}/>}
    {!totals.loading && tab === 'pay' && <PayrollTab
      salary={salary}
      period={period}
      onOpen={id => push(`/people/${id}/payroll`)}
      onPayAll={kind => open('payAll', { kind })}
    />}
    {!totals.loading && tab === 'ded' && <DeductionsTab totals={totals} selected={selected} onOpen={id => push(`/money/ded/${id}`)} pointName={pointName}/>}

    <Fab onClick={() => open('quick')}/>
  </Screen>
}

function FinanceTab({ totals, period, pointName }:{
  totals:ReturnType<typeof useMonthTotals>
  period:string
  pointName:(id:string | null | undefined) => string
}) {
  const { open } = useSheets()
  const operations = [...totals.transactions].sort((a, b) => b.date.localeCompare(a.date))

  return <>
    <div className="grid grid-cols-2 gap-2">
      <Card className="p-[13px]">
        <div className="lbl">Доход · {period}</div>
        <div className="mt-1 text-tile font-semibold tabular-nums text-ok">{rubles(totals.summary.income)}</div>
      </Card>
      <Card className="p-[13px]">
        <div className="lbl">Расходы · {period}</div>
        <div className="mt-1 text-tile font-semibold tabular-nums text-bad-strong">{rubles(totals.summary.expenses)}</div>
      </Card>
    </div>

    <SectionTitle count={operations.length}>Операции</SectionTitle>
    <Card>
      {operations.length === 0
        ? <EmptyState
          title="Операций за месяц нет"
          sub="Доходы и расходы появятся здесь после первой записи"
          action={<Button variant="secondary" onClick={() => open('op', { kind: 'INCOME' })}>Добавить доход</Button>}
        />
        : <DataList
          rows={operations}
          rowKey={operation => `${operation.kind}-${operation.id}`}
          row={operation => ({
            title: operation.category,
            sub: `${dayLabel(operation.date)} · ${pointName(operation.pickupPointId)}${operation.description ? ` · ${operation.description}` : ''}`,
            right: <SignedAmount operation={operation}/>,
          })}
          columns={[
            { label: 'Дата', width: '96px', cell: operation => dayLabel(operation.date) },
            { label: 'Категория', width: 'minmax(0,1.2fr)', cell: operation => <span className="font-medium">{operation.category}</span> },
            { label: 'ПВЗ', width: 'minmax(0,1fr)', cell: operation => pointName(operation.pickupPointId) },
            { label: 'Сумма', width: '120px', align: 'right', cell: operation => <SignedAmount operation={operation}/> },
          ]}
        />}
    </Card>
  </>
}

const SignedAmount = ({ operation }:{ operation:{ kind:'INCOME' | 'EXPENSE'; amountKopecks:number } }) =>
  <span className={operation.kind === 'INCOME' ? 'text-ok' : 'text-bad-strong'}>
    {operation.kind === 'INCOME' ? '+' : '−'}{rubles(operation.amountKopecks)}
  </span>

/**
 * Ведомость месяца. Закрытия месяца нет: начисления идут из графика, выплаты — из записей
 * о выплатах, и остаток всегда считается заново (решение владельца проекта, 24.09.2026).
 */
function PayrollTab({ salary, period, onOpen, onPayAll }:{
  salary:ReturnType<typeof useSalarySheets>
  period:string
  onOpen:(employeeId:string) => void
  onPayAll:(kind:'ADVANCE' | 'PAYMENT') => void
}) {
  const { push } = useNav()
  return <>
    <Hero
      label={`К выплате за ${period}`}
      value={rubles(salary.toPay)}
      note={`Начислено ${rubles(salary.accrued)} · выплачено ${rubles(salary.paid)}`}
    />

    <div className="mt-2 flex gap-2">
      <Button className="flex-1" onClick={() => onPayAll('PAYMENT')} disabled={salary.toPay === 0}>Выплатить всем</Button>
      <Button className="flex-1" variant="secondary" onClick={() => onPayAll('ADVANCE')}>Аванс</Button>
    </div>

    <SectionTitle count={salary.sheets.length}>Ведомость</SectionTitle>
    <Card>
      {salary.sheets.length === 0
        ? <EmptyState
          title="Начислений за месяц нет"
          sub="Ведомость появится, когда сотрудники отработают смены по графику"
          action={<Button variant="secondary" onClick={() => push('/sched/wizard')}>Составить график</Button>}
        />
        : <DataList
          rows={salary.sheets}
          rowKey={sheet => sheet.employeeId}
          onOpen={sheet => onOpen(sheet.employeeId)}
          row={sheet => ({
            leading: <Avatar initials={initials(sheet.fullName)}/>,
            title: sheet.fullName,
            sub: `${sheet.shifts} смен · начислено ${rubles(sheet.accrued)}`,
            right: rubles(sheet.balance),
            rightSub: sheet.balance > 0 ? 'к выплате' : 'закрыто',
            rightSubTone: sheet.balance > 0 ? 'warn' : 'ok',
          })}
          columns={[
            { label: 'Сотрудник', width: 'minmax(0,1.6fr)', cell: sheet => <span className="font-medium">{sheet.fullName}</span> },
            { label: 'Смен', width: '64px', align: 'right', cell: sheet => sheet.shifts },
            { label: 'Начислено', width: '120px', align: 'right', cell: sheet => rubles(sheet.accrued) },
            { label: 'Выплачено', width: '120px', align: 'right', cell: sheet => rubles(sheet.paid) },
            {
              label: 'Остаток', width: '120px', align: 'right',
              cell: sheet => <span className={sheet.balance > 0 ? 'font-semibold text-warn-ink' : 'text-ok'}>{rubles(sheet.balance)}</span>,
            },
          ]}
        />}
    </Card>

    <div className="mt-2 text-sub leading-[1.4] text-muted">
      Суммы считаются сами по подтверждённым сменам, премиям, штрафам и выплатам — закрывать месяц не нужно.
    </div>
  </>
}

function DeductionsTab({ totals, selected, onOpen, pointName }:{
  totals:ReturnType<typeof useMonthTotals>
  /** Открытое справа удержание — на десктопе его строка подсвечена. */
  selected?:string
  onOpen:(id:string) => void
  pointName:(id:string | null | undefined) => string
}) {
  const all = [...totals.deductions].sort((a, b) => (b.eventAt ?? b.createdAt).localeCompare(a.eventAt ?? a.createdAt))
  const loss = totals.summary.confirmedLosses
  const { open } = useSheets()
  const [stage, setStage] = useState<DeductionStage | 'all'>('all')
  const count = (value:DeductionStage) => all.filter(row => deductionStage(row.status) === value).length
  const rows = stage === 'all' ? all : all.filter(row => deductionStage(row.status) === stage)

  return <>
    <Card className="p-[13px]">
      <div className="lbl">Убытки по WB · месяц</div>
      <div className="mt-1 text-tile font-semibold tabular-nums text-bad-strong">{rubles(loss)}</div>
      <div className="mt-1 text-sub text-muted">Подтверждённые WB и отнесённые на владельца</div>
    </Card>

    {!!all.length && <Segmented
      className="mt-3"
      value={stage}
      onChange={setStage}
      options={[
        { value: 'all', label: 'Все' },
        { value: 'decide', label: `Решить ${count('decide') || ''}`.trim() },
        { value: 'wb', label: 'Ждём WB' },
        { value: 'closed', label: 'Закрыто' },
      ]}
    />}

    <SectionTitle count={rows.length}>Удержания</SectionTitle>
    <Card>
      {rows.length === 0 && all.length
        ? <EmptyState title={stage === 'decide' ? 'Решать нечего' : stage === 'wb' ? 'Ответа WB никто не ждёт' : 'Закрытых пока нет'}/>
        : rows.length === 0
        ? <EmptyState
          title="Удержаний за месяц нет"
          sub="Загрузятся из кабинета WB или их можно добавить вручную"
          action={<Button variant="secondary" onClick={() => open('newDed')}>Добавить удержание</Button>}
        />
        : <List>
          {rows.map(deduction => <ListRow
            key={deduction.id}
            title={deduction.reason}
            sub={`${dayLabel(deduction.eventAt ?? deduction.createdAt)} · ${pointName(deduction.pickupPointId)}`}
            right={rubles(deduction.amountKopecks)}
            pill={{ label: deductionTitles[deduction.status], tone: deductionTone[deduction.status] }}
            selected={deduction.id === selected}
            onClick={() => onOpen(deduction.id)}
          />)}
        </List>}
    </Card>
  </>
}
