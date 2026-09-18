import { useQuery } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Button, TextButton } from '../../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { keys, scope } from '../../services/queries'
import { listExpenseCategories, setExpenseCategoryArchived } from '../../services/finance'
import { useWrite } from '../../features/write'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Категории расходов. Удаления нет — только архив: на категорию ссылаются прошлые
 * операции, и удалённая оставила бы их без подписи.
 */
export default function Categories() {
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const categories = useQuery({ queryKey: keys.categories(true), queryFn: () => listExpenseCategories(true) })

  const archive = useWrite({
    run: ({ id, archived }:{ id:string; archived:boolean; name:string }) => setExpenseCategoryArchived(id, archived),
    invalidate: [scope.categories],
    done: vars => vars.archived ? `«${vars.name}» в архиве` : `«${vars.name}» снова в списке`,
  })

  const rows = [...(categories.data ?? [])].sort((a, b) =>
    Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || a.name.localeCompare(b.name, 'ru'))

  return <Screen header={<Header title="Категории расходов" onBack={canBack ? back : undefined}/>}>
    {categories.error && <div className="mb-3"><ErrorNote error={categories.error}/></div>}
    <Card>
      {categories.isLoading
        ? <SkeletonRows rows={4}/>
        : !rows.length
          ? <EmptyState title="Категорий пока нет" sub="Они появляются сами, когда вы вписываете новую в расходе"/>
          : <div className="divide-y divide-line-soft">
            {rows.map(category => <div key={category.id} className="flex items-center gap-3 px-4 py-3">
              <div className={category.archivedAt ? 'min-w-0 flex-1 truncate text-row text-muted-soft' : 'min-w-0 flex-1 truncate text-row'}>
                {category.name}
              </div>
              {!category.archivedAt && <TextButton onClick={() => open('renameCat', { id: category.id, name: category.name })}>Переименовать</TextButton>}
              <TextButton onClick={() => archive.mutate({ id: category.id, archived: !category.archivedAt, name: category.name })}>
                {category.archivedAt ? 'Вернуть' : 'В архив'}
              </TextButton>
            </div>)}
          </div>}
    </Card>

    <Button block variant="secondary" className="mt-3" onClick={() => open('newCat')}>Добавить категорию</Button>
  </Screen>
}
