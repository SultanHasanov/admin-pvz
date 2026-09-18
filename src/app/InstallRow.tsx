import { ListRow } from '../shared/kit/ListRow'
import { toastDone, toastWarn } from '../shared/kit/Toaster'
import { useInstall } from '../shared/install'

/**
 * Строка «Установить на телефон» для «Ещё» и профиля сотрудника. Уже установленному
 * приложению и браузеру, который установку не умеет, строка не показывается.
 */
export function InstallRow() {
  const install = useInstall()
  if (install.installed || (!install.canPrompt && !install.iosHint)) return null

  return <ListRow
    title="Установить на телефон"
    sub={install.iosHint ? 'Safari: «Поделиться» → «На экран Домой»' : 'Иконка на экране, открывается без браузера'}
    chevron={install.canPrompt}
    align="start"
    onClick={() => {
      if (install.iosHint) { toastWarn('Нажмите «Поделиться» внизу Safari и выберите «На экран Домой»'); return }
      void install.prompt().then(accepted => { if (accepted) toastDone('Приложение установлено') })
    }}
  />
}
