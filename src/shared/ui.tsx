import type { ReactNode } from 'react'
import { Alert, App as AntApp, Button, Card, Divider, Drawer, Dropdown, Empty, List, Modal, Popconfirm, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import type { ModalProps, TableProps } from 'antd'
import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import { useIsMobile } from './responsive'
import { color } from './tokens'

/** Граница «телефон / не телефон» — одна на весь продукт, см. responsive.ts. */
export { useIsMobile, useIsDesktop } from './responsive'

/** Главное действие страницы: на телефоне уезжает в плавающую кнопку над таб-баром. */
export interface PageAction {
  label:string
  icon:ReactNode
  onClick:() => void
  disabled?:boolean
}

export function Title({ title, subtitle, action, children }:{
  title:string
  subtitle?:string
  action?:PageAction
  children?:ReactNode
}) {
  const mobile = useIsMobile()

  // На телефоне название экрана уже стоит в аппбаре — дублировать его заголовком незачем.
  if (mobile) return <>
    {(subtitle || children) && <div className="mb-4 grid gap-2">
      {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      {children && <div className="scroll-x flex gap-2">{children}</div>}
    </div>}
    {action && <Button
      type="primary" shape="circle" size="large" className="fab"
      icon={action.icon} aria-label={action.label} disabled={action.disabled} onClick={action.onClick}
    />}
  </>

  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>{title}</Typography.Title>
      {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
    </div>
    {(children || action) && <div className="flex flex-wrap items-center gap-2">
      {children}
      {action && <Button type="primary" icon={action.icon} disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>}
    </div>}
  </div>
}

export function Metric({ label, value, icon:Icon, tone = 'neutral' }:{ label:string; value:string; icon:LucideIcon; tone?:'green' | 'red' | 'neutral' }) {
  const colors = { green: color.brand, red: color.danger, neutral: color.sub }
  return <Card size="small" variant="outlined" styles={{ body: { padding: 16 } }}>
    <Statistic
      title={<span className="flex items-center gap-2"><Icon size={15} color={colors[tone]}/>{label}</span>}
      value={value}
      valueStyle={{ color: tone === 'neutral' ? undefined : colors[tone], fontSize: 20, fontWeight: 700, wordBreak: 'break-word' }}
    />
  </Card>
}

/**
 * Модалка на десктопе и лист снизу на телефоне.
 * Шторка снизу читается как родная, модалка посреди экрана — нет.
 */
export function FormModal({ title, onClose, children, footer = null, width, sheetHeight, ...rest }:{
  title:ReactNode
  onClose:() => void
  children:ReactNode
  /** Только узел: Drawer, в отличие от Modal, render-функцию футера не принимает. */
  footer?:ReactNode
  /** Лист тянется по содержимому; для длинных форм передайте '90dvh'. */
  sheetHeight?:string
} & Omit<ModalProps, 'title' | 'open' | 'onCancel' | 'children' | 'footer'>) {
  const mobile = useIsMobile()

  if (mobile) return <Drawer
    open placement="bottom" onClose={onClose} title={title} destroyOnHidden
    height={sheetHeight ?? 'auto'} className="sheet" footer={footer}
    styles={{
      body: { paddingTop: 8, maxHeight: '90dvh', overflowY: 'auto', overscrollBehavior: 'contain' },
      footer: { padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' },
      wrapper: { maxHeight: '92dvh' },
    }}
  >{children}</Drawer>

  // width деструктурирован из rest намеренно: раньше он стоял до {...rest} и перебивался.
  return <Modal
    open title={title} onCancel={onClose} footer={footer} destroyOnHidden
    width={width ?? 560} styles={{ body: { paddingTop: 8 } }}
    {...rest}
  >{children}</Modal>
}

/**
 * Футер листа: на телефоне кнопки во всю ширину столбиком, на десктопе — ряд.
 * Первой передавайте главную кнопку — на телефоне она окажется сверху.
 */
export function SheetFooter({ children }:{ children:ReactNode }) {
  return <div className="sheet-footer">{children}</div>
}

export function EmptyState({ text, action }:{ text:string; action?:ReactNode }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} style={{ padding: '32px 16px' }}>{action}</Empty>
}

export function Loading({ text = 'Загружаем…' }:{ text?:string }) {
  return <div className="grid justify-items-center gap-3 py-12">
    <Spin/>
    <Typography.Text type="secondary">{text}</Typography.Text>
  </div>
}

export function ErrorNote({ error }:{ error:unknown }) {
  if (!error) return null
  return <Alert className="mt-3" type="error" showIcon message={error instanceof Error ? error.message : String(error)}/>
}

export function Badge({ children, tone = 'slate' }:{ children:ReactNode; tone?:'slate' | 'green' | 'amber' | 'red' }) {
  const colors = { slate: 'default', green: 'success', amber: 'warning', red: 'error' } as const
  return <Tag color={colors[tone]} style={{ marginInlineEnd: 0 }}>{children}</Tag>
}

export interface RowAction {
  key:string
  label:string
  icon:ReactNode
  /** Красит пункт меню и кнопку подтверждения, но не кнопку-триггер на десктопе. */
  danger?:boolean
  /** Текст подтверждения; без него действие срабатывает сразу. */
  confirm?:string
  confirmOk?:string
  loading?:boolean
  onClick:() => void
}

/**
 * Действия строки: гроздь иконок на десктопе и одно меню «⋯» на телефоне.
 * Тултипы на тач-экране не открываются, поэтому на телефоне нужны подписи.
 */
export function RowActions({ items }:{ items:RowAction[] }) {
  const mobile = useIsMobile()
  const { modal } = AntApp.useApp()

  if (mobile) return <Dropdown
    trigger={['click']} placement="bottomRight"
    menu={{
      items: items.map(item => ({ key: item.key, label: item.label, icon: item.icon, danger: item.danger })),
      onClick: ({ key }) => {
        const action = items.find(item => item.key === key)
        if (!action) return
        // Popconfirm внутри пункта Dropdown не работает — подтверждаем диалогом.
        if (action.confirm) modal.confirm({
          title: action.confirm,
          okText: action.confirmOk ?? (action.danger ? 'Удалить' : 'Подтвердить'),
          cancelText: 'Отмена',
          okButtonProps: { danger: action.danger },
          onOk: action.onClick,
        })
        else action.onClick()
      },
    }}
  ><Button icon={<MoreHorizontal size={18}/>} aria-label="Действия"/></Dropdown>

  return <Space size={4} wrap>
    {items.map(item => item.confirm
      ? <Popconfirm
        key={item.key} title={item.confirm} cancelText="Отмена"
        okText={item.confirmOk ?? (item.danger ? 'Удалить' : 'Подтвердить')}
        okButtonProps={{ danger: item.danger }} onConfirm={item.onClick}
      >
        <Tooltip title={item.label}><Button size="small" loading={item.loading} icon={item.icon}/></Tooltip>
      </Popconfirm>
      : <Tooltip key={item.key} title={item.label}>
        <Button size="small" loading={item.loading} icon={item.icon} onClick={item.onClick}/>
      </Tooltip>)}
  </Space>
}

/**
 * Таблица на десктопе и список карточек на телефоне.
 * Колонки узкий экран не выдерживает: их либо режет, либо приходится скроллить вбок.
 */
export function ResponsiveTable<T extends object>({ mobileCard, ...props }:TableProps<T> & { mobileCard:(row:T) => ReactNode }) {
  const mobile = useIsMobile()
  const { dataSource, loading, rowKey, locale } = props

  if (!mobile) return <Table<T> size="middle" pagination={false} scroll={{ x: 'max-content' }} {...props}/>

  return <List<T>
    dataSource={[...(dataSource ?? [])]}
    loading={Boolean(loading)}
    locale={{ emptyText: (typeof locale?.emptyText === 'function' ? locale.emptyText() : locale?.emptyText) ?? 'Нет данных' }}
    rowKey={rowKey as keyof T}
    split={false}
    grid={{ column: 1, gutter: 12 }}
    renderItem={row => <List.Item style={{ marginBottom: 12 }}>
      <Card size="small" variant="outlined" styles={{ body: { padding: 14 } }}>{mobileCard(row)}</Card>
    </List.Item>}
  />
}

/** Заголовок группы полей внутри формы, прижатый к левому краю. */
export function SectionTitle({ children, first }:{ children:ReactNode; first?:boolean }) {
  return <Divider
    titlePlacement="left" plain
    style={{ marginTop: first ? 0 : 8, marginBottom: 16 }}
    styles={{ content: { marginInlineStart: 0, paddingInlineStart: 0, fontWeight: 600 } }}
  >{children}</Divider>
}

/** Строка «подпись — значение» для мобильных карточек. */
export function CardRow({ label, children }:{ label:string; children:ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5">
    <Typography.Text type="secondary" className="shrink-0 text-xs">{label}</Typography.Text>
    <span className="min-w-0 text-right text-sm">{children}</span>
  </div>
}
