import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { App } from './app/App'
import { AppErrorBoundary } from './app/StartupRecovery'
import { UpdatePrompt } from './app/UpdatePrompt'
import { Toaster } from './shared/kit/Toaster'
import './shared/styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Телефон уходит в фон и возвращается через час — данные должны подтянуться сами.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

// Русская локаль dayjs: без неё format('MMM') и format('dd') отдают английские
// сокращения, и в сетке графика появлялись «Sep» и «Su».
dayjs.locale('ru')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UpdatePrompt/>
        <AppErrorBoundary><App/></AppErrorBoundary>
        <Toaster/>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
