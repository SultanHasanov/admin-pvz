import { beforeAll, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import {
  badgeOf, buildEmployeeFeed, buildFeed, payoutAlert, requestTitle, unreadOf,
  type FeedHole, type FeedInput, type FeedRequest,
} from './notifications'

// В приложении локаль ставит main.tsx; здесь его нет, а формулировки — русские.
beforeAll(() => { dayjs.locale('ru') })

const empty:FeedInput = { requests: [], holes: [], deductions: [], recurring: [], payout: null }

const request = (patch:Partial<FeedRequest> = {}):FeedRequest => ({
  id: 'q1', employeeName: 'Ольга Смирнова', kind: 'SHIFT',
  dateFrom: '2026-09-25', dateTo: '2026-09-25', reason: 'Болезнь', createdAt: '2026-09-16T10:00:00Z',
  ...patch,
})

const hole = (patch:Partial<FeedHole> = {}):FeedHole => ({
  pointId: 'p1', pointName: 'Ленина 12', firstDate: '2026-09-19', count: 1,
  label: '19 сент', onlyPartial: false, absence: false,
  ...patch,
})

describe('сборка ленты', () => {
  it('пустые источники — пустая лента', () => {
    expect(buildFeed(empty)).toEqual([])
  })

  it('все пять источников попадают в ленту', () => {
    const feed = buildFeed({
      requests: [request()],
      holes: [hole()],
      deductions: [{ id: 'd1', title: 'Новое удержание WB · 1 200 ₽', sub: 'Подмена товара · Ленина 12', date: '2026-09-15' }],
      recurring: [{ id: 'r1', title: 'Аренда · 30 000 ₽', sub: 'Ленина 12 · 20 сент · скоро', tone: 'info', date: '2026-09-20' }],
      payout: { refId: 'rest-2026-09', title: 'Остаток', sub: '', tone: 'info', date: '2026-09-18', advance: false },
    })
    expect(feed.map(item => item.kind).sort()).toEqual(['deduction', 'hole', 'payout', 'recurring', 'request'])
  })

  it('id строки — это вид плюс ссылка на источник', () => {
    const [item] = buildFeed({ ...empty, requests: [request({ id: 'q7' })] })
    expect(item).toMatchObject({ kind: 'request', refId: 'q7', id: 'request-q7', target: { kind: 'request', id: 'q7' } })
  })

  it('сначала тревожное, внутри одного тона — свежее сверху', () => {
    const feed = buildFeed({
      ...empty,
      deductions: [{ id: 'd1', title: 'старое', sub: '', date: '2026-09-01' }],
      recurring: [
        { id: 'r1', title: 'скоро', sub: '', tone: 'info', date: '2026-09-30' },
        { id: 'r2', title: 'просрочено', sub: '', tone: 'bad', date: '2026-09-02' },
      ],
      requests: [request({ createdAt: '2026-09-17T08:00:00Z' })],
    })
    expect(feed.map(item => item.refId)).toEqual(['q1', 'r2', 'd1', 'r1'])
  })

  it('заявка выше других тревожных строк, даже если она старше', () => {
    const feed = buildFeed({
      ...empty,
      requests: [request({ createdAt: '2026-09-01T08:00:00Z' })],
      holes: [hole({ firstDate: '2026-09-25' })],
    })
    expect(feed.map(item => item.kind)).toEqual(['request', 'hole'])
  })
})

describe('заявки в ленте', () => {
  it('«не сможет выйти» — с датой смены', () => {
    expect(requestTitle(request())).toBe('Ольга Смирнова не сможет выйти 25 сент')
  })

  it('отпуск — с отрезком дат', () => {
    expect(requestTitle(request({ kind: 'VACATION', dateFrom: '2026-10-20', dateTo: '2026-10-27' })))
      .toBe('Ольга Смирнова просит отпуск 20 окт–27 окт')
  })

  it('причина и призыв к решению в подписи, тон тревожный', () => {
    const [item] = buildFeed({ ...empty, requests: [request()] })
    expect(item.sub).toBe('Причина: Болезнь · нужно решение')
    expect(item.tone).toBe('bad')
  })

  it('без причины не печатаем «null»', () => {
    const [item] = buildFeed({ ...empty, requests: [request({ reason: null })] })
    expect(item.sub).toBe('Причина: не указана · нужно решение')
  })
})

describe('дырки в ленте', () => {
  it('совпало с отпуском — нужна замена', () => {
    const [item] = buildFeed({ ...empty, holes: [hole({ absence: true })] })
    expect(item.sub).toBe('Совпало с отпуском — нужна замена')
    expect(item.tone).toBe('bad')
  })

  it('частично занятый день — «не хватает человека», жёлтый', () => {
    const [item] = buildFeed({ ...empty, holes: [hole({ onlyPartial: true })] })
    expect(item.title).toBe('Ленина 12: не хватает человека 19 сент')
    expect(item.sub).toBe('Место на смене не занято')
    expect(item.tone).toBe('warn')
  })

  it('пустые дни — число дней в подписи', () => {
    const [item] = buildFeed({ ...empty, holes: [hole({ count: 3, label: '19, 21, 23 сент' })] })
    expect(item.title).toBe('Ленина 12: нет сотрудника 19, 21, 23 сент')
    expect(item.sub).toBe('Пустых дней: 3')
  })

  it('ссылка на дырку — точка и первый день, как в комментарии миграции 0017', () => {
    const [item] = buildFeed({ ...empty, holes: [hole()] })
    expect(item.refId).toBe('p1|2026-09-19')
    expect(item.target).toEqual({ kind: 'day', pointId: 'p1', date: '2026-09-19' })
  })
})

describe('прочитанное', () => {
  const feed = buildFeed({ ...empty, requests: [request()], holes: [hole()] })

  it('без отметок непрочитано всё', () => {
    expect(unreadOf(feed, [])).toHaveLength(2)
  })

  it('отметка гасит ровно свою строку', () => {
    const unread = unreadOf(feed, [{ kind: 'request', refId: 'q1' }])
    expect(unread.map(item => item.kind)).toEqual(['hole'])
  })

  it('тот же id у другого вида — не отметка', () => {
    expect(unreadOf(feed, [{ kind: 'deduction', refId: 'q1' }])).toHaveLength(2)
  })

  it('дырка на новой дате снова непрочитана, хотя на старой отметка стоит', () => {
    const moved = buildFeed({ ...empty, holes: [hole({ firstDate: '2026-09-24' })] })
    expect(unreadOf(moved, [{ kind: 'hole', refId: 'p1|2026-09-19' }])).toHaveLength(1)
  })

  it('на бейдже больше девяти — «9+», ноль — пусто', () => {
    expect(badgeOf(0)).toBeNull()
    expect(badgeOf(3)).toBe('3')
    expect(badgeOf(12)).toBe('9+')
  })
})

describe('напоминание о выплате', () => {
  it('срок аванса прошёл и кому-то не выдано — тревожная строка с именами', () => {
    const alert = payoutAlert({
      today: '2026-09-18', month: '2026-09', advanceDay: 15, payday: 5,
      unpaid: ['Ольга Смирнова', 'Иван Петров'],
    })
    expect(alert).toMatchObject({
      refId: 'advance-2026-09',
      title: 'Аванс не выдан 2 сотрудникам',
      sub: 'Срок был 15 сентября · Ольга, Иван',
      tone: 'bad',
      advance: true,
    })
  })

  it('одному сотруднику — единственное число', () => {
    const alert = payoutAlert({ today: '2026-09-18', month: '2026-09', advanceDay: 15, payday: 5, unpaid: ['Ольга Смирнова'] })
    expect(alert?.title).toBe('Аванс не выдан 1 сотруднику')
  })

  it('аванс выдан всем — отсчёт до остатка через границу месяца', () => {
    const alert = payoutAlert({ today: '2026-09-18', month: '2026-09', advanceDay: 15, payday: 5, unpaid: [] })
    expect(alert).toMatchObject({
      refId: 'rest-2026-09',
      title: 'Остаток за сентябрь — 5 октября, через 17 дн.',
      sub: 'Выплата остатка станет доступна после 30 сентября',
      tone: 'info',
      advance: false,
    })
  })

  it('до срока аванса невыданный аванс тревогой не считается', () => {
    const alert = payoutAlert({ today: '2026-09-10', month: '2026-09', advanceDay: 15, payday: 5, unpaid: ['Ольга Смирнова'] })
    expect(alert?.advance).toBe(false)
  })

  it('без дней выплат напоминания нет', () => {
    expect(payoutAlert({ today: '2026-09-18', month: '2026-09', advanceDay: null, payday: null, unpaid: ['Ольга'] })).toBeNull()
  })
})

describe('лента сотрудника', () => {
  const base = { requests: [], substitutions: [], payments: [], deductions: [] }

  it('заявка — с датой и статусом, тон по исходу', () => {
    const [sent] = buildEmployeeFeed({ ...base, requests: [{
      id: 'q1', kind: 'SHIFT', dateFrom: '2026-09-24', dateTo: '2026-09-24',
      status: 'SENT', statusText: 'Отправлено · ждём решения владельца', createdAt: '2026-09-16T10:00:00Z',
    }] })
    expect(sent).toMatchObject({ title: 'Запрос на 24 сент', sub: 'Отправлено · ждём решения владельца', tone: 'warn' })

    const [declined] = buildEmployeeFeed({ ...base, requests: [{
      id: 'q1', kind: 'VACATION', dateFrom: '2026-10-20', dateTo: '2026-10-27',
      status: 'DECLINED', statusText: 'Владелец отказал', createdAt: '2026-09-16T10:00:00Z',
    }] })
    expect(declined).toMatchObject({ title: 'Запрос отпуска 20 окт–27 окт', tone: 'bad' })
  })

  it('решение по уже прочитанной заявке снова зажигает бейдж', () => {
    const request = { id: 'q1', kind: 'SHIFT' as const, dateFrom: '2026-09-24', dateTo: '2026-09-24', statusText: '', createdAt: '2026-09-16T10:00:00Z' }
    const sent = buildEmployeeFeed({ ...base, requests: [{ ...request, status: 'SENT' }] })
    const resolved = buildEmployeeFeed({ ...base, requests: [{ ...request, status: 'SUBSTITUTE_FOUND' }] })
    const reads = sent.map(item => ({ kind: item.kind, refId: item.refId }))
    expect(unreadOf(resolved, reads)).toHaveLength(1)
  })

  it('замена, выплата и удержание ведут в свои разделы, свежее сверху', () => {
    const feed = buildEmployeeFeed({
      ...base,
      substitutions: [{ id: 'q2', date: '2026-09-25', pointName: 'ПВЗ Садовая 30', resolvedAt: '2026-09-17T09:00:00Z' }],
      payments: [{ id: 'y1', advance: true, amount: '8 000 ₽', monthName: 'Сентябрь', date: '2026-09-15' }],
      deductions: [{ id: 'd1', reason: 'Недостача', amount: '1 400 ₽', date: '2026-09-04' }],
    })
    expect(feed.map(item => [item.title, item.target.kind])).toEqual([
      ['Вас поставили на замену', 'mySched'],
      ['Аванс 8 000 ₽', 'myMoney'],
      ['Удержание WB · Недостача', 'myDeductions'],
    ])
    expect(feed[1].sub).toBe('За сентябрь · 15 сент')
  })
})
