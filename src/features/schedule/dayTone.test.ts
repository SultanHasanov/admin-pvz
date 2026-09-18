import { describe, expect, it } from 'vitest'
import type { Shift } from '../../entities/types'
import { dayView } from './dayTone'

const shift = (employeeId:string, date:string, status:Shift['status'] = 'PLANNED'):Shift => ({
  id: `${employeeId}-${date}`, employeeId, pickupPointId: 'p1',
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`,
  payMode: 'FULL', status, slotIndex: 0, workDate: date,
})

const nameOf = (id:string) => ({ e1: 'Ольга Смирнова', e2: 'Иван Петров' })[id] ?? 'Сотрудник'
const today = '2026-09-18'

describe('день в сетке и отпуска', () => {
  it('единственный сотрудник в отпуске — синий «отп», день считается незакрытым', () => {
    const view = dayView([shift('e1', '2026-09-22')], '2026-09-22', today, nameOf,
      [{ employeeId: 'e1', from: '2026-09-20', to: '2026-09-27' }])
    expect(view).toEqual({ tone: 'info', lines: ['отп'], strong: true })
  })

  it('отпуск в прошлом дне тревогой не подсвечивается', () => {
    const view = dayView([shift('e1', '2026-09-10')], '2026-09-10', today, nameOf,
      [{ employeeId: 'e1', from: '2026-09-10', to: '2026-09-12' }])
    expect(view.strong).toBe(false)
  })

  it('напарник вышел — день обычный, отпускника в инициалах нет', () => {
    const view = dayView([shift('e1', '2026-09-22'), shift('e2', '2026-09-22')], '2026-09-22', today, nameOf,
      [{ employeeId: 'e1', from: '2026-09-20', to: '2026-09-27' }])
    expect(view.lines).toEqual(['ИП'])
    expect(view.strong).toBeUndefined()
  })

  it('запланированный день акцентный — синий остаётся только за отпуском', () => {
    expect(dayView([shift('e1', '2026-09-22')], '2026-09-22', today, nameOf).tone).toBe('accent')
  })

  it('без отпусков поведение прежнее: пустой будущий день — красный', () => {
    expect(dayView([], '2026-09-22', today, nameOf)).toEqual({ tone: 'bad', lines: ['нет'], strong: true })
  })
})
