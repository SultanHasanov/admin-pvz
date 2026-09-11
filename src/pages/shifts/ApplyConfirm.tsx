import { useState } from 'react'
import { Alert, Button, Radio, Space, Typography } from 'antd'
import type { ApplyPlan } from '../../entities/schedule'
import type { ApplyResult } from '../../services/schedule'
import { dateLabel } from '../../shared/dates'
import { FormModal } from '../../shared/ui'

const preview = (dates:string[]) => {
  const shown = dates.slice(0, 5).map(dateLabel).join(', ')
  return dates.length > 5 ? `${shown} и ещё ${dates.length - 5}` : shown
}

/** Показывается всегда, даже без конфликтов: один путь исполнения и никаких «тихих» записей. */
export function ApplyConfirm({ plan, pending, result, onApply, onClose }:{
  plan:ApplyPlan
  pending:boolean
  result:ApplyResult | null
  onApply:(strategy:'skip' | 'replace') => void
  onClose:() => void
}) {
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip')
  const nothing = !plan.toAdd.length && !plan.conflicts.length

  if (result) return <FormModal title="График применён" onClose={onClose} footer={<Button type="primary" onClick={onClose}>Понятно</Button>}>
    <Space direction="vertical" size={4} style={{ display: 'flex' }}>
      <Typography.Text>Добавлено смен: <b>{result.added}</b></Typography.Text>
      {result.replaced > 0 && <Typography.Text>Переписано: <b>{result.replaced}</b></Typography.Text>}
      {result.skipped > 0 && <Typography.Text type="secondary">Пропущено: {result.skipped}</Typography.Text>}
    </Space>
    {result.failed.length > 0 && <Alert
      className="mt-3" type="warning" showIcon
      message={`Не удалось записать ${result.failed.length} смен`}
      description={result.failed[0]?.reason}
    />}
  </FormModal>

  return <FormModal
    title="Применить график" onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={pending} disabled={nothing} onClick={() => onApply(strategy)}>Применить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Space direction="vertical" size={6} style={{ display: 'flex' }}>
      <Typography.Text>Добавим смен: <b>{plan.toAdd.length}</b></Typography.Text>
      {plan.toAdd.length > 0 && <Typography.Text type="secondary" className="text-xs">{preview(plan.toAdd.map(s => s.date))}</Typography.Text>}

      {plan.conflicts.length > 0 && <>
        <Typography.Text>Уже заняты запланированной сменой: <b>{plan.conflicts.length}</b></Typography.Text>
        <Typography.Text type="secondary" className="text-xs">{preview(plan.conflicts.map(c => c.slot.date))}</Typography.Text>
      </>}

      {plan.locked.length > 0 && <Typography.Text type="secondary">
        Не тронем — смена идёт или уже закрыта: <b>{plan.locked.length}</b>
      </Typography.Text>}
    </Space>

    {plan.conflicts.length > 0 && <Radio.Group
      className="mt-4" value={strategy} onChange={event => setStrategy(event.target.value)}
      style={{ display: 'grid', gap: 8 }}
    >
      <Radio value="skip">Пропустить занятые дни</Radio>
      <Radio value="replace">Переписать их — поставим время и ПВЗ из графика</Radio>
    </Radio.Group>}

    {nothing && <Alert className="mt-4" type="info" showIcon message="Всё уже стоит по этому графику — добавлять нечего."/>}
  </FormModal>
}
