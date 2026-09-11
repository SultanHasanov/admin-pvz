import type { ReactNode } from 'react'
import { Alert, Card, Divider, Empty, Grid, List, Modal, Spin, Statistic, Table, Tag, Typography } from 'antd'
import type { ModalProps, TableProps } from 'antd'
import type { LucideIcon } from 'lucide-react'

/** Телефон — всё, что уже меньше планшета: ниже этой границы таблицы превращаются в карточки. */
export function useIsMobile() {
  const screens = Grid.useBreakpoint()
  return !screens.md
}

export function Title({ title, subtitle, children }:{ title:string; subtitle?:string; children?:ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>{title}</Typography.Title>
      {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
    </div>
    {children}
  </div>
}

export function Metric({ label, value, icon:Icon, tone = 'neutral' }:{ label:string; value:string; icon:LucideIcon; tone?:'green' | 'red' | 'neutral' }) {
  const colors = { green: '#16a34a', red: '#dc2626', neutral: '#64748b' }
  return <Card size="small" variant="outlined" styles={{ body: { padding: 16 } }}>
    <Statistic
      title={<span className="flex items-center gap-2"><Icon size={15} color={colors[tone]}/>{label}</span>}
      value={value}
      valueStyle={{ color: tone === 'neutral' ? undefined : colors[tone], fontSize: 20, fontWeight: 700, wordBreak: 'break-word' }}
    />
  </Card>
}

/** Модалка, которая на телефоне разворачивается в лист на весь экран. */
export function FormModal({ title, onClose, children, footer = null, ...rest }:{ title:ReactNode; onClose:() => void; children:ReactNode } & Omit<ModalProps, 'title' | 'open' | 'onCancel' | 'children'>) {
  const mobile = useIsMobile()
  return <Modal
    open title={title} onCancel={onClose} footer={footer} destroyOnHidden
    width={mobile ? '100vw' : 560}
    style={mobile ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
    styles={{ body: { paddingTop: 8 } }}
    {...rest}
  >{children}</Modal>
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
