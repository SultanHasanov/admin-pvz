import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AutoComplete, Button, Card, Checkbox, Col, DatePicker, Form, Input, List, Row, Segmented, Select, Typography } from 'antd'
import dayjs from 'dayjs'
import { Bookmark, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import type { EntryKind, Transaction } from '../entities/types'
import { dateLabel, monthLabel, today } from '../shared/dates'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { color } from '../shared/tokens'
import { EmptyState, ErrorNote, FormModal, Loading, RowActions, SheetFooter, Title, useIsMobile } from '../shared/ui'
import { confirmRecurringExpense, createRecurringExpense, createTransaction, deleteTransaction, listExpenseCategories, listRecurringExpenses, listRecurringOccurrences, listTransactions, recurringDueDate, skipRecurringExpense, updateTransaction, type TransactionInput } from '../services/finance'
import { listEntryPresets, rememberAmount } from '../services/presets'
import { useOrg } from '../app/OrgContext'

export function FinancePage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points } = useOrg()
  const mobile = useIsMobile()
  const [form, setForm] = useState<{ kind:EntryKind; entry?:Transaction }>()
  const [kindFilter, setKindFilter] = useState<'ALL'|EntryKind>('ALL')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  /** На телефоне два списка рядом не помещаются — показываем по одному. */
  const [pane, setPane] = useState<EntryKind>('EXPENSE')
  const transactions = useQuery({ queryKey: ['transactions', month, pointId], queryFn: () => listTransactions(month, pointId || undefined) })

  const remove = useMutation({
    mutationFn: ({ kind, id }:{ kind:EntryKind; id:string }) => deleteTransaction(kind, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const categories = [...new Set((transactions.data ?? []).map(x => x.category))].sort()
  // На телефоне селект типа скрыт, поэтому его значение не должно влиять: иначе после
  // поворота экрана вкладка «Расходы» могла бы оказаться пустой из-за фильтра «Доходы».
  const effectiveKind = mobile ? 'ALL' : kindFilter
  const filtered = (transactions.data ?? []).filter(x => (effectiveKind === 'ALL' || x.kind === effectiveKind)
    && (!categoryFilter || x.category === categoryFilter)
    && (!search.trim() || `${x.category} ${x.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))
  const income = filtered.filter(x => x.kind === 'INCOME')
  const expenses = filtered.filter(x => x.kind === 'EXPENSE')
  const sum = (rows:Transaction[]) => rows.reduce((total, row) => total + row.amountKopecks, 0)

  const list = (title:string, rows:Transaction[]) => <EntryList
    title={title} total={sum(rows)} rows={rows} loading={transactions.isLoading} pointName={pointName}
    onEdit={entry => setForm({ kind: entry.kind, entry })}
    onDelete={entry => remove.mutate({ kind: entry.kind, id: entry.id })}
  />
  const exportCsv = () => {
    const escape = (value:string|number) => `"${String(value).replaceAll('"','""')}"`
    const csv = ['Дата;Тип;ПВЗ;Категория;Сумма;Комментарий', ...filtered.map(row => [row.date,row.kind === 'INCOME' ? 'Доход':'Расход',pointName(row.pickupPointId),row.category,(row.amountKopecks/100).toFixed(2),row.description ?? ''].map(escape).join(';'))].join('\n')
    const link = document.createElement('a'); link.href=URL.createObjectURL(new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'})); link.download=`pvz-finance-${month}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  return <>
    <Title
      title="Финансы" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}
      action={{ label: 'Расход', icon: <Plus size={16}/>, onClick: () => setForm({ kind: 'EXPENSE' }), disabled: !points.length }}
    >
      <Button icon={<Plus size={15}/>} onClick={() => setForm({ kind: 'INCOME' })} disabled={!points.length}>Доход</Button>
    </Title>

    {!points.length && <Alert className="mb-4" type="warning" showIcon message="Сначала добавьте ПВЗ — записи привязываются к точке."/>}

    <Card size="small" className="mb-4">
      {/* Фиксированных ширин нет: на телефоне поля растягиваются на всю строку. */}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        {/* На телефоне тип операции выбирает Segmented ниже — второй такой фильтр
            только путал бы: «Доходы» в селекте и «Расходы» в переключателе дают пустой список. */}
        {!mobile && <Select value={kindFilter} onChange={setKindFilter} style={{ width: 150 }} options={[{value:'ALL',label:'Все операции'},{value:'INCOME',label:'Доходы'},{value:'EXPENSE',label:'Расходы'}]}/>}
        <Select allowClear value={categoryFilter || undefined} onChange={value => setCategoryFilter(value ?? '')} placeholder="Все категории" style={mobile ? { width: '100%' } : { minWidth: 180 }} options={categories.map(value => ({value,label:value}))}/>
        <Input allowClear value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по описанию" style={{ width: mobile ? '100%' : 220 }}/>
        <Button block={mobile} icon={<Download size={15}/>} disabled={!filtered.length} onClick={exportCsv}>CSV</Button>
        <Typography.Text type="secondary">Найдено: {filtered.length} · итог {rubles(filtered.reduce((total,row) => total + (row.kind === 'INCOME' ? row.amountKopecks : -row.amountKopecks),0))}</Typography.Text>
      </div>
    </Card>

    {mobile
      ? <>
        <Segmented
          block className="mb-3" value={pane} onChange={value => setPane(value as EntryKind)}
          options={[{ value: 'EXPENSE', label: 'Расходы' }, { value: 'INCOME', label: 'Доходы' }]}
        />
        {pane === 'EXPENSE' ? list('Расходы', expenses) : list('Доходы', income)}
      </>
      : <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>{list('Доходы', income)}</Col>
        <Col xs={24} lg={12}>{list('Расходы', expenses)}</Col>
      </Row>}

    <RecurringExpenses/>

    <ErrorNote error={transactions.error ?? remove.error}/>
    {form && <EntryForm kind={form.kind} entry={form.entry} onClose={() => setForm(undefined)}/>}
  </>
}

function RecurringExpenses() {
  const queryClient = useQueryClient()
  const { month, points, pointName, defaultPointId } = useOrg()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ pickupPointId:string; category:string; amount:string; dayOfMonth:number; description?:string }>()
  const recurring = useQuery({ queryKey:['recurring-expenses'], queryFn:listRecurringExpenses })
  const occurrences = useQuery({ queryKey:['recurring-occurrences',month], queryFn:() => listRecurringOccurrences(month) })
  const invalidate = () => { for (const key of ['recurring-expenses','recurring-occurrences','transactions']) void queryClient.invalidateQueries({ queryKey:[key] }) }
  const create = useMutation({ mutationFn:(values:{ pickupPointId:string; category:string; amount:string; dayOfMonth:number; description?:string }) => createRecurringExpense({ ...values, amountKopecks:parseMoney(values.amount) }), onSuccess:() => { setOpen(false); form.resetFields(); invalidate() } })
  const resolve = useMutation({ mutationFn:({ id, dueOn, action }:{ id:string; dueOn:string; action:'pay'|'skip' }) => action === 'pay' ? confirmRecurringExpense(id,dueOn) : skipRecurringExpense(id,dueOn), onSuccess:invalidate })
  const statusOf = (id:string) => occurrences.data?.find(item => item.recurringExpenseId === id)?.status ?? 'PENDING'

  return <Card className="mt-4" title="Регулярные расходы" extra={<Button icon={<Plus size={15}/>} onClick={() => setOpen(true)}>Добавить</Button>}>
    <Typography.Paragraph type="secondary">Подтвердите готовый платёж одной кнопкой — до подтверждения он не попадёт в фактические расходы.</Typography.Paragraph>
    {!recurring.data?.length ? <EmptyState text="Регулярных расходов пока нет."/> : <List dataSource={recurring.data} rowKey="id" renderItem={item => {
      const dueOn = recurringDueDate(month,item.dayOfMonth), status = statusOf(item.id)
      return <List.Item actions={status === 'PENDING' ? [
        <Button key="pay" type="primary" size="small" loading={resolve.isPending} onClick={() => resolve.mutate({ id:item.id,dueOn,action:'pay' })}>Оплачено</Button>,
        <Button key="skip" size="small" onClick={() => resolve.mutate({ id:item.id,dueOn,action:'skip' })}>Пропустить</Button>,
      ] : [<Typography.Text key="status" type="secondary">{status === 'PAID' ? 'Оплачено' : 'Пропущено'}</Typography.Text>]}>
        <List.Item.Meta title={`${item.category} · ${rubles(item.amountKopecks)}`} description={`${pointName(item.pickupPointId)} · ${dateLabel(dueOn)}${item.description ? ` · ${item.description}` : ''}`}/>
      </List.Item>
    }}/>
    }
    <ErrorNote error={recurring.error ?? occurrences.error ?? create.error ?? resolve.error}/>
    {open && <FormModal title="Регулярный расход" onClose={() => setOpen(false)} footer={<SheetFooter><Button type="primary" onClick={() => form.submit()} loading={create.isPending}>Сохранить</Button><Button onClick={() => setOpen(false)}>Отмена</Button></SheetFooter>}>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ pickupPointId:defaultPointId ?? points[0]?.id, dayOfMonth:1 }} onFinish={values => create.mutate(values)}>
        <Form.Item name="pickupPointId" label="ПВЗ" rules={[{required:true,message:'Выберите ПВЗ'}]}><Select options={points.map(p => ({value:p.id,label:p.name}))}/></Form.Item>
        <Form.Item name="category" label="Категория" rules={[{required:true,message:'Укажите категорию'}]}><Input/></Form.Item>
        <div className="grid gap-4 sm:grid-cols-2"><Form.Item name="amount" label="Сумма, ₽" rules={[{validator:(_,value) => isValidMoney(value) ? Promise.resolve() : Promise.reject(new Error('Укажите сумму'))}]}><Input inputMode="decimal" suffix="₽"/></Form.Item><Form.Item name="dayOfMonth" label="День месяца" rules={[{required:true,type:'number',min:1,max:31}]}><Input type="number" min={1} max={31}/></Form.Item></div>
        <Form.Item name="description" label="Комментарий"><Input placeholder="Необязательно"/></Form.Item>
      </Form>
    </FormModal>}
  </Card>
}

function EntryList({ title, total, rows, loading, pointName, onEdit, onDelete }:{
  title:string; total:number; rows:Transaction[]; loading:boolean
  pointName:(id:string | null) => string; onEdit:(entry:Transaction) => void; onDelete:(entry:Transaction) => void
}) {
  return <Card
    variant="outlined" styles={{ body: { padding: rows.length ? 0 : undefined } }}
    title={title} extra={<Typography.Text strong>{rubles(total)}</Typography.Text>}
  >
    {loading ? <Loading/> : !rows.length ? <EmptyState text="Записей за этот месяц нет."/>
      : <List
        dataSource={rows} rowKey="id"
        renderItem={entry => <List.Item style={{ paddingInline: 16 }} actions={[
          <Typography.Text key="sum" strong style={{ color: entry.kind === 'INCOME' ? color.brand : undefined, whiteSpace: 'nowrap' }}>
            {rubles(entry.amountKopecks)}
          </Typography.Text>,
          <RowActions key="actions" items={[
            { key: 'edit', label: 'Изменить', icon: <Pencil size={15}/>, onClick: () => onEdit(entry) },
            { key: 'delete', label: 'Удалить', icon: <Trash2 size={15}/>, danger: true, confirm: 'Удалить запись?', onClick: () => onDelete(entry) },
          ]}/>,
        ]}>
          <List.Item.Meta
            title={<span className="text-sm">{entry.category}</span>}
            description={<span className="text-xs">
              {dateLabel(entry.date)} · {pointName(entry.pickupPointId)}{entry.description ? ` · ${entry.description}` : ''}
            </span>}
          />
        </List.Item>}
      />}
  </Card>
}

function EntryForm({ kind, entry, onClose }:{ kind:EntryKind; entry?:Transaction; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points, defaultPointId } = useOrg()
  const [pickupPointId, setPoint] = useState(entry?.pickupPointId ?? defaultPointId ?? points[0]?.id ?? '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [amount, setAmount] = useState(entry ? moneyInput(entry.amountKopecks) : '')
  const [date, setDate] = useState(entry?.date ?? today())
  const [description, setDescription] = useState(entry?.description ?? '')
  const [remember, setRemember] = useState(!entry)

  const presets = useQuery({ queryKey: ['presets', pickupPointId], queryFn: () => listEntryPresets(pickupPointId), enabled: Boolean(pickupPointId) })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => listExpenseCategories(), enabled: kind === 'EXPENSE' })

  const matched = useMemo(() => presets.data?.find(preset => preset.kind === kind && preset.categoryName === category.trim()), [presets.data, kind, category])
  // Запомненная сумма подставляется при выборе категории, но не затирает то, что владелец уже ввёл руками.
  const [touched, setTouched] = useState(Boolean(entry))
  useEffect(() => { if (!touched && matched) setAmount(moneyInput(matched.amountKopecks)) }, [matched, touched])

  const known = useMemo(() => {
    const names = new Set<string>()
    presets.data?.filter(p => p.kind === kind).forEach(p => names.add(p.categoryName))
    if (kind === 'EXPENSE') categories.data?.forEach(c => names.add(c.name))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [presets.data, categories.data, kind])

  const save = useMutation({
    mutationFn: async () => {
      const input:TransactionInput = { kind, pickupPointId, category, amountKopecks: parseMoney(amount), date, description }
      if (entry) await updateTransaction(entry.id, input)
      else await createTransaction(input)
      if (remember && pickupPointId) await rememberAmount({ pickupPointId, kind, category, amountKopecks: parseMoney(amount) })
    },
    onSuccess: () => {
      for (const key of ['transactions', 'presets', 'expense-categories']) void queryClient.invalidateQueries({ queryKey: [key] })
      onClose()
    },
  })

  const changedFromPreset = matched && parseMoney(amount) !== matched.amountKopecks
  const ready = isValidMoney(amount) && Boolean(category.trim()) && Boolean(pickupPointId)

  return <FormModal
    title={`${entry ? 'Изменить' : 'Новый'} ${kind === 'INCOME' ? 'доход' : 'расход'}`} onClose={onClose}
    footer={<SheetFooter>
      <Button type="primary" loading={save.isPending} disabled={!ready} icon={remember ? <Bookmark size={15}/> : undefined} onClick={() => save.mutate()}>
        Сохранить{isValidMoney(amount) ? ` ${rubles(parseMoney(amount))}` : ''}
      </Button>
      <Button onClick={onClose}>Отмена</Button>
    </SheetFooter>}
  >
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="ПВЗ" required>
        <Select
          value={pickupPointId || undefined} onChange={setPoint} placeholder="Выберите ПВЗ"
          options={points.map(point => ({ value: point.id, label: point.name }))}
        />
      </Form.Item>

      <Form.Item label="Категория" required extra={matched ? `Запомнено для этого ПВЗ: ${rubles(matched.amountKopecks)}` : undefined}>
        <AutoComplete
          value={category} onChange={value => { setCategory(value); setTouched(false) }}
          options={known.map(name => ({ value: name }))}
          filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
          placeholder={kind === 'INCOME' ? 'Например, Wildberries' : 'Например, Аренда'}
        />
      </Form.Item>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="Сумма, ₽" required>
          <Input inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setTouched(true) }} suffix="₽"/>
        </Form.Item>
        <Form.Item label="Дата" required>
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false} value={dayjs(date)} onChange={value => value && setDate(value.format('YYYY-MM-DD'))}/>
        </Form.Item>
      </div>

      <Form.Item label="Комментарий">
        <Input value={description ?? ''} onChange={e => setDescription(e.target.value)} placeholder="Необязательно"/>
      </Form.Item>

      <Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} style={{ alignItems: 'flex-start' }}>
        {matched && changedFromPreset ? 'Запомнить новую сумму для этой категории и ПВЗ' : 'Запомнить сумму для этой категории и ПВЗ'}
        <div><Typography.Text type="secondary" className="text-xs">В следующий раз она подставится автоматически.</Typography.Text></div>
      </Checkbox>

      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}
