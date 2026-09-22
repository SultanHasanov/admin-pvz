import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Удаляет только файлы PWA. Авторизация и пользовательские настройки в
 * localStorage остаются на месте.
 */
export async function clearPwaCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
  }
}

export function StartupRecovery({ message = 'Не удалось запустить приложение.' }:{ message?:string }) {
  const reload = () => window.location.reload()
  const reset = async () => {
    try { await clearPwaCache() }
    finally { window.location.reload() }
  }

  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: '#f4f1ee', color: '#1b1614', fontFamily: 'system-ui, sans-serif' }}>
    <section style={{ width: '100%', maxWidth: 420, padding: 20, borderRadius: 18, background: '#fff', boxShadow: '0 10px 30px rgba(27,22,20,.1)' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Приложение не загрузилось</h1>
      <p style={{ margin: '10px 0 18px', lineHeight: 1.5, color: '#746d69' }}>{message}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <button type="button" onClick={() => void reset()} style={{ border: 0, borderRadius: 12, padding: '12px 16px', background: '#7c4dff', color: '#fff', font: 'inherit', fontWeight: 600 }}>
          Очистить кэш и обновить
        </button>
        <button type="button" onClick={reload} style={{ border: '1px solid #ddd5d0', borderRadius: 12, padding: '12px 16px', background: '#fff', color: '#1b1614', font: 'inherit' }}>
          Повторить загрузку
        </button>
      </div>
    </section>
  </main>
}

export class AppErrorBoundary extends Component<{ children:ReactNode }, { failed:boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error:Error, info:ErrorInfo) {
    console.error('[app] startup error', error, info.componentStack)
  }

  render() {
    return this.state.failed
      ? <StartupRecovery message="Возможно, телефон сохранил несовместимую версию приложения."/>
      : this.props.children
  }
}
