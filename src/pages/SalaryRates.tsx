import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Checkbox, Form, Input, Select, Space, Switch, Tooltip, Typography } from 'antd'
import type { TableProps } from 'antd'
import { Pencil, Plus } from 'lucide-react'
import type { PaymentType, SalaryRate } from '../entities/types'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { paymentTitles, rateAmount, rateTitle } from '../shared/salary'
import { CardRow, EmptyState, ErrorNote, FormModal, ResponsiveTable } from '../shared/ui'
import { createSalaryRate, listSalaryRates, setDefaultSalaryRate, setSalaryRateArchived, updateSalaryRate } from '../services/rates'

/** Справочник ставок: заводится один раз, дальше выбирается в карточке сотрудника. */
export function SalaryRatesPanel() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<SalaryRate | null>(null)
  const [creating, setCreating] = useState(false)
  const rates = useQuery({ queryKey: ['salary-rates', true], queryFn: () => listSalaryRates(true) })

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['salary-rates'] }) }
  const archive = useMutation({
    mutationFn: ({ id, archived }:{ id:string; archived:boolean }) => setSalaryRateArchived(id, archived),
    onSuccess: invalidate,
  })
  const makeDefault = useMutation({
    mutationFn: ({ id, isDefault }:{ id:string; isDefault:boolean }) => setDefaultSalaryRate(id, isDefault),
    onSuccess: invalidate,
  })

  const defaultBox = (rate:SalaryRate) => <Checkbox
    checked={rate.isDefault} disabled={Boolean(rate.archivedAt) || makeDefault.isPending}
    onChange={event => makeDefault.mutate({ id: rate.id, isDefault: event.target.checked })}
  />

  const visibleSwitch = (rate:SalaryRate) => <Switch
    size="small" checked={!rate.archivedAt} loading={archive.isPending}
    aria-label={rate.archivedAt ? 'Вернуть ставку в выбор' : 'Убрать ставку из выбора'}
    onChange={visible => archive.mutate({ id: rate.id, archived: !visible })}
  />

  const columns:TableProps<SalaryRate>['columns'] = [
    { title: 'Ставка', key: 'title', render: (_, rate) => <Typography.Text strong>{rateTitle(rate)}</Typography.Text> },
    {
      title: 'Тип оплаты', key: 'type', width: 190,
      render: (_, rate) => `${paymentTitles[rate.paymentType]}${rate.paymentType === 'SALARY' ? ` · норма ${rate.monthlyNormDays} дн.` : ''}`,
    },
    { title: 'Сумма', key: 'amount', align: 'right', width: 160, render: (_, rate) => <Typography.Text strong>{rateAmount(rate)}</Typography.Text> },
    { title: 'По умолчанию', key: 'default', align: 'center', width: 130, render: (_, rate) => defaultBox(rate) },
    { title: 'Показывать', key: 'visible', align: 'center', width: 120, render: (_, rate) => visibleSwitch(rate) },
    {
      title: '', key: 'actions', align: 'right', width: 60,
      render: (_, rate) => <Tooltip title="Изменить ставку"><Button icon={<Pencil size={15}/>} onClick={() => setEditing(rate)}/></Tooltip>,
    },
  ]

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Typography.Text type="secondary">Заведите ставки один раз — в карточке сотрудника останется только выбрать нужную.</Typography.Text>
      <Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)}>Добавить ставку</Button>
    </div>

    <Card variant="outlined" styles={{ body: { padding: 0 } }}>
      <ResponsiveTable<SalaryRate>
        rowKey="id" columns={columns} dataSource={rates.data ?? []} loading={rates.isLoading}
        locale={{ emptyText: <EmptyState text="Ставок пока нет." action={<Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)}>Добавить первую ставку</Button>}/> }}
        mobileCard={rate => <>
          <div className="mb-2 flex items-start justify-between gap-2">
            <Typography.Text strong>{rateTitle(rate)}</Typography.Text>
            <Button size="small" icon={<Pencil size={15}/>} aria-label="Изменить ставку" onClick={() => setEditing(rate)}/>
          </div>
          <CardRow label="Тип">{paymentTitles[rate.paymentType]}{rate.paymentType === 'SALARY' ? ` · норма ${rate.monthlyNormDays} дн.` : ''}</CardRow>
          <CardRow label="Сумма"><Typography.Text strong>{rateAmount(rate)}</Typography.Text></CardRow>
          <CardRow label="По умолчанию">{defaultBox(rate)}</CardRow>
          <CardRow label="Показывать">{visibleSwitch(rate)}</CardRow>
        </>}
      />
    </Card>

    <Typography.Paragraph type="secondary" className="mt-3 text-xs">
      Ставка по умолчанию сразу подставляется новому сотруднику — в его карточке её всегда можно поменять.
      Скрытая ставка исчезает из выбора, но расчёты прошлых месяцев по ней сохраняются.
    </Typography.Paragraph>

    <ErrorNote error={rates.error ?? archive.error ?? makeDefault.error}/>
    {(creating || editing) && <RateForm rate={editing} onClose={() => { setCreating(false); setEditing(null) }}/>}
  </>
}

function RateForm({ rate, onClose }:{ rate:SalaryRate | null; onClose:() => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(rate?.name ?? '')
  const [paymentType, setPaymentType] = useState<PaymentType>(rate?.paymentType ?? 'SHIFT')
  const [amount, setAmount] = useState(rate ? moneyInput(rate.rateKopecks) : '')
  const [normDays, setNormDays] = useState(String(rate?.monthlyNormDays ?? 22))

  const save = useMutation({
    mutationFn: async () => {
      const input = { name, paymentType, rateKopecks: parseMoney(amount), monthlyNormDays: Number(normDays) || 22 }
      if (rate) return void await updateSalaryRate(rate.id, input)
      await createSalaryRate(input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['salary-rates'] })
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
  })

  const namePlaceholder = paymentType === 'HOURLY' ? 'Например: подработка' : paymentType === 'SALARY' ? 'Например: управляющий' : 'Например: ночная'
  const amountLabel = paymentType === 'HOURLY' ? 'Сумма за час, ₽' : paymentType === 'SALARY' ? 'Оклад за месяц, ₽' : 'Сумма за смену, ₽'

  return <FormModal
    title={rate ? 'Изменить ставку' : 'Новая ставка'} onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} disabled={!isValidMoney(amount)} onClick={() => save.mutate()}>Сохранить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Form layout="vertical" requiredMark={false}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="Тип оплаты">
          <Select autoFocus value={paymentType} onChange={setPaymentType} options={Object.entries(paymentTitles).map(([value, label]) => ({ value, label }))}/>
        </Form.Item>
        <Form.Item label={amountLabel} required>
          <Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} suffix="₽"/>
        </Form.Item>
      </div>
      {paymentType === 'SALARY' && <Form.Item label="Норма рабочих дней в месяце" extra="Из неё считается оплата за один отработанный день.">
        <Input inputMode="numeric" value={normDays} onChange={e => setNormDays(e.target.value)}/>
      </Form.Item>}
      <Form.Item
        label="Пометка (необязательно)"
        extra={`Нужна, только если ставок одного типа несколько. Без неё ставка называется «${paymentTitles[paymentType]} · ${isValidMoney(amount) ? rubles(parseMoney(amount)) : '…'}».`}
      >
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={namePlaceholder}/>
      </Form.Item>
      {rate && <Typography.Text type="secondary" className="text-xs">
        Изменение суммы затронет расчёт будущих смен. Уже закрытые месяцы останутся с прежними цифрами.
      </Typography.Text>}
      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}
