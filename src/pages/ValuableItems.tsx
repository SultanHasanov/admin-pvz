import { useMutation } from '@tanstack/react-query'
import { PackageSearch } from 'lucide-react'
import { ErrorNote } from '../shared/ui'
import { requestEarlyAccess } from '../services/org'

export function ValuableItemsPage() {
  const request = useMutation({ mutationFn: () => requestEarlyAccess('valuable_items') })
  return <div className="card mx-auto max-w-2xl p-6 text-center sm:p-8">
    <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><PackageSearch/></div>
    <h1 className="mt-4 text-xl font-bold sm:text-2xl">Контроль товаров</h1>
    <p className="mx-auto mt-3 max-w-lg text-slate-500">Автоматический контроль дорогих товаров и перегруженных ячеек. Раздел ещё в разработке — оставьте заявку, и мы позовём вас в ранний доступ.</p>
    <button className="btn btn-primary mt-6" disabled={request.isPending || request.isSuccess} onClick={() => request.mutate()}>
      {request.isSuccess ? 'Заявка принята' : request.isPending ? 'Отправляем…' : 'Хочу ранний доступ'}
    </button>
    <ErrorNote error={request.error}/>
  </div>
}
