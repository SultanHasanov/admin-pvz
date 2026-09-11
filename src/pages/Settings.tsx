import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Col, Form, Input, List, Row, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { Archive, Pencil, RefreshCw, RotateCcw, Unplug } from 'lucide-react'
import type { ModuleKey } from '../entities/types'
import { ErrorNote, Loading, Title } from '../shared/ui'
import { listEnabledModules, moduleTitles, getTaxSettings, saveTaxSettings, setModuleEnabled } from '../services/settings'
import { getOrganization, renameOrganization } from '../services/org'
import { listExpenseCategories, renameExpenseCategory, setExpenseCategoryArchived } from '../services/finance'
import { disconnectWb, getWbStatus, syncWb } from '../services/wb'

const modules = Object.keys(moduleTitles) as ModuleKey[]

export function SettingsPage() {
  return <>
    <Title title="Настройки" subtitle="Организация, налог, модули и категории расходов"/>
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <div className="grid gap-4"><OrganizationCard/><WbIntegrationCard/><TaxCard/></div>
      </Col>
      <Col xs={24} lg={12}>
        <div className="grid gap-4"><ModulesCard/><CategoriesCard/></div>
      </Col>
    </Row>
  </>
}

function WbIntegrationCard() {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ['wb-integration'], queryFn: getWbStatus })
  const [result, setResult] = useState('')
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['wb-integration'] }) }
  const reloadImported = () => {
    for (const key of ['points', 'employees', 'deductions', 'salary']) void queryClient.invalidateQueries({ queryKey: [key] })
  }
  const sync = useMutation({
    mutationFn: syncWb,
    onSuccess: data => {
      setResult(`Загружено: ПВЗ — ${data.points}, сотрудников — ${data.employees}, удержаний — ${data.deductions}.`)
      refresh(); reloadImported()
    },
  })
  const disconnect = useMutation({ mutationFn: disconnectWb, onSuccess: () => { setResult(''); refresh() } })
  const connected = status.data?.status === 'CONNECTED'

  return <Card
    variant="outlined" title="Кабинет WB ПВЗ"
    extra={<Tag color={connected ? 'success' : 'default'}>{connected ? 'Подключён' : 'Не подключён'}</Tag>}
  >
    <Typography.Paragraph type="secondary">
      Загружает ваши ПВЗ, сотрудников и удержания с привязкой к ответственному сотруднику.
    </Typography.Paragraph>

    {!connected && <Alert
      type="info" showIcon
      message={<>Откройте раздел «Telegram», подключите собственного бота и отправьте ему команду <b>«🔐 Подключить WB»</b>. Телефон и код WB вводятся только в личном чате с вашим ботом.</>}
    />}

    {connected && <>
      <Space wrap>
        <Button type="primary" loading={sync.isPending} icon={<RefreshCw size={16}/>} onClick={() => sync.mutate()}>Обновить данные WB</Button>
        <Button loading={disconnect.isPending} icon={<Unplug size={16}/>} onClick={() => disconnect.mutate()}>Отключить</Button>
      </Space>
      {status.data?.lastSyncAt && <Typography.Paragraph type="secondary" className="mt-2 text-xs">
        Последнее обновление: {new Date(status.data.lastSyncAt).toLocaleString('ru-RU')}
      </Typography.Paragraph>}
      {result && <Alert className="mt-3" type="success" showIcon message={result}/>}
    </>}

    <ErrorNote error={status.error ?? sync.error ?? disconnect.error}/>
  </Card>
}

function OrganizationCard() {
  const queryClient = useQueryClient()
  const organization = useQuery({ queryKey: ['organization'], queryFn: getOrganization })
  const [name, setName] = useState('')
  useEffect(() => { if (organization.data) setName(organization.data.name) }, [organization.data])
  const save = useMutation({
    mutationFn: () => renameOrganization(name),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organization'] }) },
  })

  return <Card variant="outlined" title="Организация">
    <Form layout="vertical" requiredMark={false} onSubmitCapture={event => { event.preventDefault(); save.mutate() }}>
      <Form.Item label="Название" required>
        <Input value={name} onChange={e => setName(e.target.value)}/>
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!name.trim()}>Сохранить</Button>
    </Form>
    <ErrorNote error={organization.error ?? save.error}/>
  </Card>
}

function TaxCard() {
  const queryClient = useQueryClient()
  const tax = useQuery({ queryKey: ['tax'], queryFn: getTaxSettings })
  const [rate, setRate] = useState('0')
  const [enabled, setEnabled] = useState(false)
  useEffect(() => { if (tax.data) { setRate(String(tax.data.rate)); setEnabled(tax.data.enabled) } }, [tax.data])
  const save = useMutation({
    mutationFn: () => saveTaxSettings({ rate: Number(rate) || 0, enabled }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['tax'] }) },
  })

  return <Card variant="outlined" title="Налог">
    <Typography.Paragraph type="secondary">Считается от дохода за месяц и вычитается из чистой прибыли.</Typography.Paragraph>
    <Form layout="vertical" requiredMark={false} onSubmitCapture={event => { event.preventDefault(); save.mutate() }}>
      <Form.Item>
        <Checkbox checked={enabled} onChange={e => setEnabled(e.target.checked)}>Учитывать налог в расчётах</Checkbox>
      </Form.Item>
      <Form.Item label="Ставка, %">
        <Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} suffix="%"/>
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить</Button>
    </Form>
    <ErrorNote error={tax.error ?? save.error}/>
  </Card>
}

function ModulesCard() {
  const queryClient = useQueryClient()
  const enabled = useQuery({ queryKey: ['modules'], queryFn: listEnabledModules })
  const toggle = useMutation({
    mutationFn: ({ module, next }:{ module:ModuleKey; next:boolean }) => setModuleEnabled(module, next),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['modules'] }) },
  })
  const active = new Set(enabled.data ?? [])

  return <Card variant="outlined" title="Модули" styles={{ body: { padding: 0 } }}>
    <div className="px-6 pt-4">
      <Typography.Text type="secondary">Выключенный модуль скрывается из меню.</Typography.Text>
    </div>
    {enabled.isLoading ? <Loading/> : <List
      dataSource={modules} rowKey={module => module}
      renderItem={module => <List.Item
        style={{ paddingInline: 24 }}
        actions={[<Switch
          key="toggle" checked={active.has(module)} loading={toggle.isPending}
          onChange={next => toggle.mutate({ module, next })}
        />]}
      >{moduleTitles[module]}</List.Item>}
    />}
    <ErrorNote error={enabled.error ?? toggle.error}/>
  </Card>
}

function CategoriesCard() {
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['expense-categories', 'all'], queryFn: () => listExpenseCategories(true) })
  const [editing, setEditing] = useState<string>()
  const [name, setName] = useState('')
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    void queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }
  const rename = useMutation({
    mutationFn: ({ id, value }:{ id:string; value:string }) => renameExpenseCategory(id, value),
    onSuccess: () => { setEditing(undefined); invalidate() },
  })
  const archive = useMutation({
    mutationFn: ({ id, archived }:{ id:string; archived:boolean }) => setExpenseCategoryArchived(id, archived),
    onSuccess: invalidate,
  })

  return <Card variant="outlined" title="Категории расходов" styles={{ body: { padding: 0 } }}>
    <div className="px-6 pt-4">
      <Typography.Text type="secondary">Создаются автоматически при добавлении расхода.</Typography.Text>
    </div>
    {categories.isLoading ? <Loading/>
      : !categories.data?.length ? <div className="px-6 py-5"><Typography.Text type="secondary">Категорий пока нет.</Typography.Text></div>
        : <List
          dataSource={categories.data} rowKey="id"
          renderItem={category => <List.Item
            style={{ paddingInline: 24 }}
            actions={editing === category.id ? [] : [
              <Tooltip key="rename" title="Переименовать">
                <Button type="text" size="small" icon={<Pencil size={15}/>} onClick={() => { setEditing(category.id); setName(category.name) }}/>
              </Tooltip>,
              <Tooltip key="archive" title={category.archivedAt ? 'Вернуть' : 'В архив'}>
                <Button
                  type="text" size="small" icon={category.archivedAt ? <RotateCcw size={15}/> : <Archive size={15}/>}
                  onClick={() => archive.mutate({ id: category.id, archived: !category.archivedAt })}
                />
              </Tooltip>,
            ]}
          >
            {editing === category.id
              ? <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); rename.mutate({ id: category.id, value: name }) }}>
                <Input autoFocus value={name} onChange={e => setName(e.target.value)}/>
                <Button type="primary" htmlType="submit" loading={rename.isPending}>ОК</Button>
                <Button onClick={() => setEditing(undefined)}>Отмена</Button>
              </form>
              : <Typography.Text delete={Boolean(category.archivedAt)} type={category.archivedAt ? 'secondary' : undefined} className="truncate">
                {category.name}
              </Typography.Text>}
          </List.Item>}
        />}
    <ErrorNote error={categories.error ?? rename.error ?? archive.error}/>
  </Card>
}
