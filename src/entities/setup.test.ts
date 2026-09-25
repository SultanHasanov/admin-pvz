import { describe, expect, it } from 'vitest'
import { countDone, nextStep, stepsOf, type SetupProgress } from './setup'

const progress = (patch:Partial<SetupProgress> = {}):SetupProgress => ({
  points: true, employees: false, defaultRate: false, shifts: false, income: false, expense: false,
  invite: false, tax: false, payDays: false, telegram: false, hidden: false, ...patch,
})

const statusOf = (patch:Partial<SetupProgress>) =>
  Object.fromEntries(stepsOf(progress(patch)).map(step => [step.id, step.status]))

describe('stepsOf', () => {
  it('после регистрации выполнен только пункт, следующее — сотрудники', () => {
    const steps = stepsOf(progress())
    expect(countDone(steps)).toBe(1)
    expect(nextStep(steps)?.id).toBe('employees')
  })

  it('график закрыт, пока нет сотрудников', () => {
    expect(statusOf({}).shifts).toBe('locked')
    expect(statusOf({ employees: true }).shifts).toBe('todo')
  })

  it('следующим становится первое доступное невыполненное задание', () => {
    expect(nextStep(stepsOf(progress({ employees: true, defaultRate: true })))?.id).toBe('shifts')
    // Сотрудников нет — график закрыт, следующим идёт ставка, а не график.
    expect(nextStep(stepsOf(progress({ income: true })))?.id).toBe('employees')
  })

  it('выполненное вне порядка тоже засчитывается', () => {
    const steps = stepsOf(progress({ income: true, expense: true }))
    expect(countDone(steps)).toBe(3)
    expect(statusOf({ income: true }).income).toBe('done')
  })

  it('всё сделано — следующего задания нет', () => {
    const steps = stepsOf(progress({ employees: true, defaultRate: true, shifts: true, income: true, expense: true }))
    expect(countDone(steps)).toBe(6)
    expect(nextStep(steps)).toBeUndefined()
  })

  it('дополнительные задания не считаются в «из» и не становятся следующими', () => {
    const steps = stepsOf(progress({ employees: true, defaultRate: true, shifts: true, income: true, expense: true }))
    expect(nextStep(steps)).toBeUndefined()
    expect(countDone(stepsOf(progress({ tax: true, payDays: true })))).toBe(1)
    expect(statusOf({}).tax).toBe('todo')
  })

  it('приглашение закрыто, пока нет сотрудников', () => {
    expect(statusOf({}).invite).toBe('locked')
    expect(statusOf({ employees: true }).invite).toBe('todo')
    expect(statusOf({ employees: true, invite: true }).invite).toBe('done')
  })
})
