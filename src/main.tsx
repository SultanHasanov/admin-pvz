import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { App } from './app/App'
import { AppErrorBoundary } from './app/StartupRecovery'
import { UpdatePrompt } from './app/UpdatePrompt'
import { Toaster } from './shared/kit/Toaster'
import './shared/styles.css'

const DAY = 24 * 60 * 60 * 1000
/** Поднять, когда меняется форма данных в сервисах: старый кэш с диска тогда выбрасывается. */
const CACHE_VERSION = '1'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Кэш переживает перезагрузку (см. persister ниже), а без долгого gcTime
      // восстановленные записи выбрасывались бы через 5 минут.
      gcTime: DAY,
      // Телефон уходит в фон и возвращается через час — данные должны подтянуться сами.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

// После перезагрузки экраны сразу рисуют прошлые данные и тихо обновляют их в фоне,
// вместо скелетонов на каждом экране. Хранилище недоступно (приватный режим) — работаем как раньше.
const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : (() => { try { return window.localStorage } catch { return undefined } })(),
  key: 'pvz.cache',
  throttleTime: 1000,
})

// Русская локаль dayjs: без неё format('MMM') и format('dd') отдают английские
// сокращения, и в сетке графика появлялись «Sep» и «Su».
dayjs.locale('ru')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{
      persister,
      maxAge: DAY,
      buster: CACHE_VERSION,
      dehydrateOptions: { shouldDehydrateQuery: query => query.state.status === 'success' },
    }}>
      <BrowserRouter>
        <UpdatePrompt/>
        <AppErrorBoundary><App/></AppErrorBoundary>
        <Toaster/>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
