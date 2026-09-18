import { useSearchParams } from 'react-router-dom'
import { Screen, Header, FilterRow } from '../shared/kit/Screen'
import { Card, Hero } from '../shared/kit/Card'
import { Avatar, List, ListRow, Pill } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { Segmented } from '../shared/kit/Segmented'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { Fab } from '../shared/kit/TabBar'
import type { Tone } from '../shared/kit/tokens'
import type { DeductionStatus } from '../entities/types'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { dayLabel, monthLabel } from '../shared/dates'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { scope } from '../services/queries'
import { closeSalaryPeriod, reopenSalaryPeriod } from '../services/salary'
import { useWrite } from '../features/write'
import { toastWarn } from '../shared/kit/Toaster'

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
export default function Money() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'fin'
  const { month, pointId, pointName } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)

  const period = monthLabel(month).split(' ')[0]

  // Закрытие сохраняет снимок ведомости по всем сотрудникам — с фильтром ПВЗ в него
  // попала бы только часть людей, поэтому закрываем только при «Все ПВЗ».
  const togglePeriod = useWrite({
    run: () => salary.closed ? reopenSalaryPeriod(month) : closeSalaryPeriod(month, salary.sheets),
    invalidate: [scope.salaryPeriod],
    done: salary.closed ? `${period}: месяц снова открыт` : `${period}: месяц закрыт, расчёт сохранён`,
  })
  const askTogglePeriod = () => {
    if (!salary.closed && pointId) { toastWarn('Закрыть месяц можно, когда выбраны «Все ПВЗ»'); return }
    open('confirm', salary.closed
      ? { text: `Открыть ${period.toLowerCase()} снова? Суммы начнут пересчитываться по текущему графику и ставкам.`, yesLabel: 'Открыть', tone: 'accent', onYes: () => togglePeriod.mutate(undefined as void) }
      : { text: `Закрыть ${period.toLowerCase()}? Расчёт сохранится, а правки графика за этот месяц потребуют перерасчёта.`, yesLabel: 'Закрыть месяц', tone: 'accent', onYes: () => togglePeriod.mutate(undefined as void) })
  }

  const setTab = (next:Tab) => setParams(current => {
    const copy = new URLSearchParams(current)
    copy.set('tab', next)
    return copy
  }, { replace: true })

  return <Screen
    header={<Header title="Деньги"/>}
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
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
      onTogglePeriod={askTogglePeriod}
    />}
    {!totals.loading && tab === 'ded' && <DeductionsTab totals={totals} onOpen={id => push(`/money/ded/${id}`)} pointName={pointName}/>}

    <Fab onClick={() => open('quick')}/>
  </Screen>
}

function FinanceTab({ totals, period, pointName }:{
  totals:ReturnType<typeof useMonthTotals>
  period:string
  pointName:(id:string | null | undefined) => string
}) {
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
        ? <EmptyState title="Операций за месяц нет" sub="Доходы и расходы появятся здесь после первой записи"/>
        : <List>
          {operations.map(operation => <ListRow
            key={`${operation.kind}-${operation.id}`}
            title={operation.category}
            sub={`${dayLabel(operation.date)} · ${pointName(operation.pickupPointId)}${operation.description ? ` · ${operation.description}` : ''}`}
            right={<span className={operation.kind === 'INCOME' ? 'text-ok' : 'text-bad-strong'}>
              {operation.kind === 'INCOME' ? '+' : '−'}{rubles(operation.amountKopecks)}
            </span>}
          />)}
        </List>}
    </Card>
  </>
}

function PayrollTab({ salary, period, onOpen, onPayAll, onTogglePeriod }:{
  salary:ReturnType<typeof useSalarySheets>
  period:string
  onOpen:(employeeId:string) => void
  onPayAll:(kind:'ADVANCE' | 'PAYMENT') => void
  onTogglePeriod:() => void
}) {
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

    <SectionTitle count={salary.sheets.length} action={salary.closed ? <Pill tone="ok">месяц закрыт</Pill> : undefined}>
      Ведомость
    </SectionTitle>
    <Card>
      {salary.sheets.length === 0
        ? <EmptyState title="Начислений за месяц нет" sub="Ведомость появится, когда сотрудники отработают смены"/>
        : <List>
          {salary.sheets.map(sheet => <ListRow
            key={sheet.employeeId}
            leading={<Avatar initials={initials(sheet.fullName)}/>}
            title={sheet.fullName}
            sub={`${sheet.shifts} смен · начислено ${rubles(sheet.accrued)}`}
            right={rubles(sheet.balance)}
            rightSub={sheet.balance > 0 ? 'к выплате' : 'закрыто'}
            rightSubTone={sheet.balance > 0 ? 'warn' : 'ok'}
            onClick={() => onOpen(sheet.employeeId)}
          />)}
        </List>}
    </Card>

    <Button block variant="secondary" className="mt-3" onClick={onTogglePeriod}>
      {salary.closed ? 'Открыть месяц снова' : 'Закрыть месяц — выплачено'}
    </Button>
    <div className="mt-2 text-sub leading-[1.4] text-muted">
      {salary.closed
        ? 'Месяц закрыт: расчёт сохранён. Если поправить график задним числом, суммы разойдутся.'
        : 'Закройте месяц, когда всё выплачено: расчёт сохранится и не поплывёт от будущих правок.'}
    </div>
  </>
}

function DeductionsTab({ totals, onOpen, pointName }:{
  totals:ReturnType<typeof useMonthTotals>
  onOpen:(id:string) => void
  pointName:(id:string | null | undefined) => string
}) {
  const rows = [...totals.deductions].sort((a, b) => (b.eventAt ?? b.createdAt).localeCompare(a.eventAt ?? a.createdAt))
  const loss = totals.summary.confirmedLosses

  return <>
    <Card className="p-[13px]">
      <div className="lbl">Убытки по WB · месяц</div>
      <div className="mt-1 text-tile font-semibold tabular-nums text-bad-strong">{rubles(loss)}</div>
      <div className="mt-1 text-sub text-muted">Подтверждённые WB и отнесённые на владельца</div>
    </Card>

    <SectionTitle count={rows.length}>Удержания</SectionTitle>
    <Card>
      {rows.length === 0
        ? <EmptyState title="Удержаний за месяц нет" sub="Загрузятся из кабинета WB или их можно добавить вручную"/>
        : <List>
          {rows.map(deduction => <ListRow
            key={deduction.id}
            title={deduction.reason}
            sub={`${dayLabel(deduction.eventAt ?? deduction.createdAt)} · ${pointName(deduction.pickupPointId)}`}
            right={rubles(deduction.amountKopecks)}
            pill={{ label: deductionTitles[deduction.status], tone: deductionTone[deduction.status] }}
            onClick={() => onOpen(deduction.id)}
          />)}
        </List>}
    </Card>
  </>
}
