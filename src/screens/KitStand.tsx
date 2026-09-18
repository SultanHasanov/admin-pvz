import { lazy, Suspense } from 'react'
import { AppShell } from '../app/Shell'
import { SkeletonRows } from '../shared/kit/Misc'

const KitCatalogue = lazy(() => import('./KitCatalogue'))

/**
 * Стенд дизайн-системы на /kit. Смонтирован до проверки сессии: данных он не трогает,
 * а смотреть его нужно в первую очередь с телефона, где заводить вход неудобно.
 */
export default function KitStand() {
  return <AppShell render={() => <Suspense fallback={<div className="p-4"><SkeletonRows/></div>}>
    <KitCatalogue/>
  </Suspense>}/>
}
