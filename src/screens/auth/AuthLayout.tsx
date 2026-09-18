import type { ReactNode } from 'react'

/**
 * Экраны до входа: вход, регистрация, восстановление, приглашение. Живут вне оболочки
 * с табами — табы без аккаунта бессмысленны, — но на той же дизайн-системе.
 */
export function AuthLayout({ children }:{ children:ReactNode }) {
  return <div className="kit-root grid min-h-dvh place-items-center bg-bg px-4 py-8">
    <div className="w-full max-w-[420px]">{children}</div>
  </div>
}

/** Знак «П» из прототипа: акцентный квадрат со скруглением. */
export function Logo() {
  return <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent text-lead font-semibold text-white">П</div>
}
