import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Collapse, Form, Input, List, Popconfirm, Select, Space, Typography } from 'antd'
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { EntryKind, PickupPoint } from '../entities/types'
import { isValidMoney, parseMoney, rubles } from '../shared/money'
import { Badge, EmptyState, ErrorNote, FormModal, Loading, Title } from '../shared/ui'
import { createPickupPoint, listPickupPoints, setPickupPointArchived, updatePickupPoint } from '../services/points'
import { deleteEntryPreset, listEntryPresets, rememberAmount } from '../services/presets'

export function PointsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PickupPoint | null>(null)
  const [creating, setCreating] = useState(false)
  const points = useQuery({ queryKey: ['points', 'all'], queryFn: () => listPickupPoints(true) })

  const archive = useMutation({
    mutationFn: ({ id, archived }:{ id:string; archived:boolean }) => setPickupPointArchived(id, archived),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['points'] }) },
  })

  return <>
    <Title title="Пункты выдачи" subtitle="Точки и запомненные суммы доходов и расходов">
      <Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)}>Добавить ПВЗ</Button>
    </Title>

    {points.isLoading ? <Card variant="outlined"><Loading/></Card>
      : !points.data?.length ? <Card variant="outlined">
        <EmptyState text="Пунктов выдачи пока нет." action={<Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)}>Добавить первый ПВЗ</Button>}/>
      </Card>
      : <div className="grid gap-4">{points.data.map(point => <Card
        key={point.id} variant="outlined" styles={{ body: { padding: 0 } }}
        title={<Space size={8} wrap>
          <Typography.Text strong>{point.name}</Typography.Text>
          {point.archivedAt && <Badge>В архиве</Badge>}
        </Space>}
        extra={<Space size={4} wrap>
          <Button icon={<Pencil size={15}/>} onClick={() => setEditing(point)}/>
          <Button
            icon={point.archivedAt ? <RotateCcw size={15}/> : <Archive size={15}/>}
            onClick={() => archive.mutate({ id: point.id, archived: !point.archivedAt })}
          />
        </Space>}
      >
        <div className="px-5 py-4">
          <Typography.Text type="secondary">{point.address}</Typography.Text>
          <div><Typography.Text type="secondary" className="text-xs">{point.timezone}</Typography.Text></div>
        </div>
        <Collapse
          ghost
          items={[{ key: 'presets', label: 'Запомненные суммы', children: <PresetPanel pointId={point.id}/> }]}
        />
      </Card>)}</div>}

    <ErrorNote error={archive.error}/>
    {(creating || editing) && <PointForm point={editing} onClose={() => { setCreating(false); setEditing(null) }}/>}
  </>
}

function PointForm({ point, onClose }:{ point:PickupPoint | null; onClose:() => void }) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const save = useMutation({
    mutationFn: (values:{ name:string; address:string; timezone:string }) => point
      ? updatePickupPoint(point.id, values)
      : createPickupPoint(values).then(() => undefined),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['points'] }); onClose() },
  })

  return <FormModal
    title={point ? 'Изменить ПВЗ' : 'Новый ПВЗ'} onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>Сохранить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Form
      form={form} layout="vertical" requiredMark={false}
      initialValues={{ name: point?.name ?? '', address: point?.address ?? '', timezone: point?.timezone ?? 'Europe/Moscow' }}
      onFinish={values => save.mutate(values)}
    >
      <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Укажите название' }]}>
        <Input placeholder="Короткое название точки"/>
      </Form.Item>
      <Form.Item name="address" label="Адрес" rules={[{ required: true, message: 'Укажите адрес' }]}><Input/></Form.Item>
      <Form.Item name="timezone" label="Часовой пояс" rules={[{ required: true, message: 'Укажите часовой пояс' }]}><Input/></Form.Item>
      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}

function PresetPanel({ pointId }:{ pointId:string }) {
  const queryClient = useQueryClient()
  const presets = useQuery({ queryKey: ['presets', pointId], queryFn: () => listEntryPresets(pointId) })
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['presets'] }) }

  const [kind, setKind] = useState<EntryKind>('EXPENSE')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')

  const saveAmount = useMutation({
    mutationFn: () => rememberAmount({ pickupPointId: pointId, kind, category, amountKopecks: parseMoney(amount) }),
    onSuccess: () => { setCategory(''); setAmount(''); invalidate() },
  })
  const removeAmount = useMutation({ mutationFn: deleteEntryPreset, onSuccess: invalidate })

  return <div>
    <Typography.Paragraph type="secondary" className="text-xs">
      Подставляются в форму «Финансы», когда выбрана эта категория.
    </Typography.Paragraph>

    <Card size="small" variant="outlined" styles={{ body: { padding: 0 } }}>
      {presets.isLoading ? <Loading/> : !presets.data?.length ? <EmptyState text="Пока ничего не запомнено."/>
        : <List
          dataSource={presets.data} rowKey="id" size="small"
          renderItem={preset => <List.Item
            style={{ paddingInline: 12 }}
            actions={[
              <Typography.Text strong key="amount">{rubles(preset.amountKopecks)}</Typography.Text>,
              <Popconfirm
                key="delete" title={`Удалить «${preset.categoryName}»?`} okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }}
                onConfirm={() => removeAmount.mutate(preset.id)}
              ><Button type="text" size="small" icon={<Trash2 size={15}/>} aria-label="Удалить"/></Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={<span className="text-sm">{preset.categoryName}</span>}
              description={<span className="text-xs">{preset.kind === 'INCOME' ? 'Доход' : 'Расход'}</span>}
            />
          </List.Item>}
        />}
    </Card>

    {/* На телефоне поля встают в столбик, на десктопе — в одну строку. */}
    <form className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_140px_auto]" onSubmit={e => { e.preventDefault(); saveAmount.mutate() }}>
      <Select value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: 'Расход' }, { value: 'INCOME', label: 'Доход' }]}/>
      <Input placeholder="Категория" value={category} onChange={e => setCategory(e.target.value)}/>
      <Input placeholder="Сумма" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} suffix="₽"/>
      <Button type="primary" htmlType="submit" loading={saveAmount.isPending} disabled={!category.trim() || !isValidMoney(amount)}>Запомнить</Button>
    </form>

    <ErrorNote error={saveAmount.error ?? removeAmount.error}/>
    <Typography.Paragraph type="secondary" className="mt-3 text-xs">
      Ставки сотрудников переехали в раздел «Зарплаты» → вкладка «Ставки».
    </Typography.Paragraph>
  </div>
}
