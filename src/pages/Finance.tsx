import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AutoComplete, Button, Card, Checkbox, Col, DatePicker, Form, Input, List, Popconfirm, Row, Select, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import { Bookmark, Pencil, Plus, Trash2 } from 'lucide-react'
import type { EntryKind, Transaction } from '../entities/types'
import { dateLabel, monthLabel, today } from '../shared/dates'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { EmptyState, ErrorNote, FormModal, Loading, Title } from '../shared/ui'
import { createTransaction, deleteTransaction, listExpenseCategories, listTransactions, updateTransaction, type TransactionInput } from '../services/finance'
import { listEntryPresets, rememberAmount } from '../services/presets'
import { useOrg } from '../app/OrgContext'

export function FinancePage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points } = useOrg()
  const [form, setForm] = useState<{ kind:EntryKind; entry?:Transaction }>()
  const transactions = useQuery({ queryKey: ['transactions', month, pointId], queryFn: () => listTransactions(month, pointId || undefined) })

  const remove = useMutation({
    mutationFn: ({ kind, id }:{ kind:EntryKind; id:string }) => deleteTransaction(kind, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const income = (transactions.data ?? []).filter(x => x.kind === 'INCOME')
  const expenses = (transactions.data ?? []).filter(x => x.kind === 'EXPENSE')
  const sum = (rows:Transaction[]) => rows.reduce((total, row) => total + row.amountKopecks, 0)

  const list = (title:string, rows:Transaction[]) => <EntryList
    title={title} total={sum(rows)} rows={rows} loading={transactions.isLoading} pointName={pointName}
    onEdit={entry => setForm({ kind: entry.kind, entry })}
    onDelete={entry => remove.mutate({ kind: entry.kind, id: entry.id })}
  />

  return <>
    <Title title="Финансы" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <Space wrap>
        <Button icon={<Plus size={15}/>} onClick={() => setForm({ kind: 'INCOME' })} disabled={!points.length}>Доход</Button>
        <Button type="primary" icon={<Plus size={16}/>} onClick={() => setForm({ kind: 'EXPENSE' })} disabled={!points.length}>Расход</Button>
      </Space>
    </Title>

    {!points.length && <Alert className="mb-4" type="warning" showIcon message="Сначала добавьте ПВЗ — записи привязываются к точке."/>}

    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>{list('Доходы', income)}</Col>
      <Col xs={24} lg={12}>{list('Расходы', expenses)}</Col>
    </Row>

    <ErrorNote error={transactions.error ?? remove.error}/>
    {form && <EntryForm kind={form.kind} entry={form.entry} onClose={() => setForm(undefined)}/>}
  </>
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
          <Typography.Text key="sum" strong style={{ color: entry.kind === 'INCOME' ? '#16a34a' : undefined, whiteSpace: 'nowrap' }}>
            {rubles(entry.amountKopecks)}
          </Typography.Text>,
          <Button key="edit" type="text" size="small" aria-label="Изменить" icon={<Pencil size={15}/>} onClick={() => onEdit(entry)}/>,
          <Popconfirm
            key="delete" title="Удалить запись?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(entry)}
          ><Button type="text" size="small" aria-label="Удалить" icon={<Trash2 size={15}/>}/></Popconfirm>,
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
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} disabled={!ready} icon={remember ? <Bookmark size={15}/> : undefined} onClick={() => save.mutate()}>
        Сохранить{isValidMoney(amount) ? ` ${rubles(parseMoney(amount))}` : ''}
      </Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
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
