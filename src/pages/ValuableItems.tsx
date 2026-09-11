import { useMutation } from '@tanstack/react-query'
import { Button, Card, Result } from 'antd'
import { PackageSearch } from 'lucide-react'
import { ErrorNote } from '../shared/ui'
import { requestEarlyAccess } from '../services/org'

export function ValuableItemsPage() {
  const request = useMutation({ mutationFn: () => requestEarlyAccess('valuable_items') })
  return <Card variant="outlined" style={{ maxWidth: 720, margin: '0 auto' }}>
    <Result
      icon={<PackageSearch size={48} color="#16a34a"/>}
      title="Контроль товаров"
      subTitle="Автоматический контроль дорогих товаров и перегруженных ячеек. Раздел ещё в разработке — оставьте заявку, и мы позовём вас в ранний доступ."
      extra={<Button
        type="primary" loading={request.isPending} disabled={request.isSuccess}
        onClick={() => request.mutate()}
      >{request.isSuccess ? 'Заявка принята' : 'Хочу ранний доступ'}</Button>}
    />
    <ErrorNote error={request.error}/>
  </Card>
}
