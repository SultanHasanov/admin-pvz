import { describe, expect, it } from 'vitest'
import { keys, scope } from './queries'

/** Первые элементы всех ключей: функции вызываем с заглушками, значения аргументов не важны. */
const heads = new Set<unknown>(Object.values(keys).map(key => (typeof key === 'function' ? (key as (...args:string[]) => readonly unknown[])('x', 'y') : key)[0]))

describe('префиксы сброса кэша', () => {
  it.each(Object.entries(scope))('%s совпадает с началом ключа из keys', (_name, prefix) => {
    expect(heads.has(prefix[0])).toBe(true)
  })

  it('у каждого семейства ключей с данными по месяцам есть префикс', () => {
    const covered = new Set<string>(Object.values(scope).map(prefix => prefix[0]))
    for (const family of ['shifts', 'transactions', 'deductions', 'salary-payments', 'bonuses', 'penalties', 'employees']) {
      expect(covered.has(family), family).toBe(true)
    }
  })
})
