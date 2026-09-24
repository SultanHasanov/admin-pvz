/**
 * Данные для снимков экранов. Взяты из сид-набора прототипа, чтобы картинки можно было
 * сравнивать один в один: те же ПВЗ, сотрудники, суммы и даты.
 *
 * Месяц фиксированный — сентябрь 2026, как в прототипе. Экраны берут месяц из
 * localStorage (`pvz.month`), поэтому снимки не зависят от текущей даты.
 */
export const MONTH = '2026-09'

const point = (id:string, name:string, address:string) => ({
  id, organization_id: 'org-1', name, address, timezone: 'Europe/Moscow', archived_at: null,
})

export const points = [
  point('p1', 'ПВЗ Ленина 12', 'ул. Ленина, 12'),
  point('p2', 'ПВЗ Мира 5', 'пр. Мира, 5'),
  point('p3', 'ПВЗ Садовая 30', 'ул. Садовая, 30'),
]

const employee = (id:string, fullName:string, phone:string, pointIds:string[], rate:number) => ({
  id, organization_id: 'org-1', full_name: fullName, phone, telegram_username: null,
  payment_type: 'SHIFT', status: 'ACTIVE',
  employee_pickup_points: pointIds.map(pickup_point_id => ({ pickup_point_id })),
  salary_rules: [{
    id: `r-${id}`, employee_id: id, payment_type: 'SHIFT', rate_kopecks: rate,
    effective_from: '2026-03-01', monthly_norm_days: 22, salary_rate_id: null, hourly_rate_kopecks: null,
  }],
})

export const employees = [
  employee('e1', 'Ирина Соколова', '+7 912 445-18-02', ['p1'], 220000),
  employee('e2', 'Дмитрий Орлов', '+7 917 302-77-14', ['p1'], 200000),
  employee('e3', 'Алина Гусева', '+7 906 118-45-90', ['p2'], 210000),
  employee('e4', 'Марат Хайруллин', '+7 927 660-23-51', ['p2'], 200000),
  employee('e5', 'Ольга Панина', '+7 903 872-09-66', ['p3'], 230000),
  employee('e6', 'Сергей Белов', '+7 964 231-84-73', ['p3'], 190000),
  // Работает на двух точках: на нём проверяется второе место на смене в мастере графика.
  employee('e7', 'Камила Юсупова', '+7 919 505-61-28', ['p1', 'p2'], 210000),
]

export const salaryRules = employees.flatMap(row => row.salary_rules)

/** Смены 2/2 по трём точкам: часть месяца завершена, дальше — план. */
export const shifts = (() => {
  const rows:Record<string, unknown>[] = []
  const hours:Record<string, [string, string]> = { p1: ['09:00', '21:00'], p2: ['10:00', '20:00'], p3: ['09:00', '21:00'] }
  const queue:Record<string, string[]> = { p1: ['e1', 'e2'], p2: ['e3', 'e4'], p3: ['e5', 'e6'] }
  let id = 1

  for (const pointId of ['p1', 'p2', 'p3']) {
    for (let day = 1; day <= 30; day += 1) {
      // Два дня через два: сотрудники сменяют друг друга блоками.
      const employeeId = queue[pointId][Math.floor((day - 1) / 2) % 2]
      const date = `${MONTH}-${String(day).padStart(2, '0')}`
      // 19 сентября на Ленина никто не выходит — пустой день в сетке.
      if (pointId === 'p1' && day === 19) continue
      rows.push({
        id: `s${id++}`, organization_id: 'org-1', employee_id: employeeId, pickup_point_id: pointId,
        planned_start: `${date}T${hours[pointId][0]}:00+03:00`,
        planned_end: `${date}T${hours[pointId][1]}:00+03:00`,
        actual_start: null, actual_end: null, pay_mode: day === 15 && pointId === 'p3' ? 'HALF' : 'FULL',
        status: day <= 17 ? 'COMPLETED' : 'PLANNED',
      })
    }
  }
  return rows
})()

export const incomeEntries = [
  { id: 'i1', pickup_point_id: 'p1', date: `${MONTH}-07`, category: 'Выручка WB', amount_kopecks: 8640000, description: 'Отчёт за период' },
  { id: 'i2', pickup_point_id: 'p1', date: `${MONTH}-14`, category: 'Выручка WB', amount_kopecks: 9120000, description: null },
  { id: 'i3', pickup_point_id: 'p2', date: `${MONTH}-07`, category: 'Выручка WB', amount_kopecks: 6230000, description: null },
  { id: 'i4', pickup_point_id: 'p2', date: `${MONTH}-14`, category: 'Выручка WB', amount_kopecks: 5890000, description: null },
  { id: 'i5', pickup_point_id: 'p3', date: `${MONTH}-14`, category: 'Выручка WB', amount_kopecks: 8020000, description: null },
  { id: 'i6', pickup_point_id: 'p1', date: `${MONTH}-06`, category: 'Платное хранение', amount_kopecks: 420000, description: 'Крупногабарит' },
]

export const expenseEntries = [
  { id: 'x1', pickup_point_id: 'p1', date: `${MONTH}-05`, amount_kopecks: 4500000, description: 'Сентябрь', expense_categories: { name: 'Аренда' } },
  { id: 'x2', pickup_point_id: 'p2', date: `${MONTH}-05`, amount_kopecks: 3800000, description: null, expense_categories: { name: 'Аренда' } },
  { id: 'x3', pickup_point_id: 'p3', date: `${MONTH}-05`, amount_kopecks: 4100000, description: null, expense_categories: { name: 'Аренда' } },
  { id: 'x4', pickup_point_id: 'p1', date: `${MONTH}-10`, amount_kopecks: 120000, description: null, expense_categories: { name: 'Интернет' } },
  { id: 'x5', pickup_point_id: 'p1', date: `${MONTH}-03`, amount_kopecks: 235000, description: 'Скотч, пакеты', expense_categories: { name: 'Хозтовары' } },
  { id: 'x6', pickup_point_id: 'p3', date: `${MONTH}-12`, amount_kopecks: 980000, description: 'Замена ролика', expense_categories: { name: 'Ремонт' } },
]

export const deductions = [
  { id: 'd1', pickup_point_id: 'p1', employee_id: 'e1', shift_id: null, event_at: `${MONTH}-04T10:00:00+03:00`, amount_kopecks: 140000, reason: 'Недостача при инвентаризации', status: 'EMPLOYEE_LIABILITY', comment: null, created_at: `${MONTH}-04T10:00:00+03:00` },
  { id: 'd2', pickup_point_id: 'p2', employee_id: 'e4', shift_id: null, event_at: `${MONTH}-09T10:00:00+03:00`, amount_kopecks: 280000, reason: 'Повреждение товара', status: 'DISPUTED', comment: null, created_at: `${MONTH}-09T10:00:00+03:00` },
  { id: 'd3', pickup_point_id: 'p1', employee_id: null, shift_id: null, event_at: `${MONTH}-12T10:00:00+03:00`, amount_kopecks: 95000, reason: 'Просрочен возврат', status: 'NEW', comment: null, created_at: `${MONTH}-12T10:00:00+03:00` },
  { id: 'd4', pickup_point_id: 'p3', employee_id: 'e6', shift_id: null, event_at: `${MONTH}-14T10:00:00+03:00`, amount_kopecks: 160000, reason: 'Нарушение упаковки', status: 'OWNER_LOSS', comment: null, created_at: `${MONTH}-14T10:00:00+03:00` },
  // Разделённое удержание из сида прототипа (d6): 2 400 ₽ — Ирина 1 000, Камила 1 000, 400 — убыток.
  { id: 'd5', pickup_point_id: 'p1', employee_id: null, shift_id: null, event_at: `${MONTH}-16T10:00:00+03:00`, amount_kopecks: 240000, reason: 'Пересорт при выдаче', status: 'EMPLOYEE_LIABILITY', comment: null, created_at: `${MONTH}-16T10:00:00+03:00` },
]

export const deductionParts = [
  { deduction_id: 'd5', employee_id: 'e1', amount_kopecks: 100000 },
  { deduction_id: 'd5', employee_id: 'e7', amount_kopecks: 100000 },
]

export const deductionEvents = [
  { id: 'de1', deduction_id: 'd1', event_type: 'IMPORTED', note: 'Загружено из кабинета WB', created_at: `${MONTH}-04T10:00:00+03:00` },
  { id: 'de2', deduction_id: 'd1', event_type: 'STATUS_CHANGED', note: 'Статус: Из зарплаты · Ирина Соколова', created_at: `${MONTH}-05T09:00:00+03:00` },
]

export const bonuses = [
  { id: 'b1', employee_id: 'e2', date: `${MONTH}-13`, amount_kopecks: 150000, comment: 'Рекорд по выдачам' },
]

export const penalties = [
  { id: 'n1', employee_id: 'e4', pickup_point_id: 'p2', date: `${MONTH}-10`, amount_kopecks: 100000, reason: 'Опоздание', comment: null, status: 'ASSIGNED' },
]

export const payments = [
  { id: 'y1', employee_id: 'e1', date: `${MONTH}-15`, accrual_month: `${MONTH}-01`, pickup_point_id: null, amount_kopecks: 1000000, kind: 'ADVANCE', comment: null },
  { id: 'y2', employee_id: 'e5', date: `${MONTH}-15`, accrual_month: `${MONTH}-01`, pickup_point_id: null, amount_kopecks: 800000, kind: 'ADVANCE', comment: null },
]

export const recurring = [
  { id: 'rc1', pickup_point_id: 'p1', category_id: 'c1', amount_kopecks: 4500000, day_of_month: 20, description: null, active: true, expense_categories: { name: 'Аренда' } },
  { id: 'rc2', pickup_point_id: 'p3', category_id: 'c2', amount_kopecks: 600000, day_of_month: 18, description: null, active: true, expense_categories: { name: 'Уборка' } },
]

export const categories = [
  { id: 'c1', name: 'Аренда', archived_at: null },
  { id: 'c2', name: 'Уборка', archived_at: null },
  { id: 'c3', name: 'Хозтовары', archived_at: null },
]

export const modules = [
  'employees', 'shifts', 'salary', 'income', 'expenses', 'taxes', 'penalties', 'wb_deductions', 'telegram', 'analytics',
].map(module => ({ organization_id: 'org-1', module, enabled: true }))

/**
 * Организация подставляется всем строкам разом: сервисы фильтруют по organization_id,
 * и без него заглушка отдавала бы пустые ответы — экраны выглядели бы как «данных нет».
 */
const withOrg = (rows:Record<string, unknown>[]) =>
  rows.map(row => ({ organization_id: 'org-1', ...row }))

/**
 * Открытая заявка, как в сиде прототипа: Сергей заболел. Дата не 25-е, как в прототипе,
 * а 24-е — по очереди 2/2 в фикстурах именно в этот день на Садовой выходит Сергей,
 * иначе шторке решения нечего было бы показать про его смену.
 */
export const shiftRequests = [
  {
    id: 'q1', employee_id: 'e6', pickup_point_id: 'p3', kind: 'SHIFT',
    date_from: `${MONTH}-24`, date_to: `${MONTH}-24`, reason: 'Болезнь', status: 'SENT',
    substitute_employee_id: null, resolution_comment: null, resolved_at: null,
    created_at: `${MONTH}-16T10:00:00+03:00`,
  },
]

/** Отпуск Алины из прототипа: на точке p2 появятся синие дни и дырки «нужна замена». */
export const vacations = [
  { id: 'v1', employee_id: 'e3', date_from: `${MONTH}-20`, date_to: `${MONTH}-27`, kind: 'UNPAID', source_request_id: null, comment: null },
]

export const tables:Record<string, unknown[]> = {
  organization_members: [{ organization_id: 'org-1', user_id: 'user-1', role: 'OWNER', employee_id: null }],
  organizations: [{ id: 'org-1', name: 'ИП Ковалёв А. С.', currency: 'RUB' }],
  pickup_points: points,
  employees,
  salary_rules: withOrg(salaryRules),
  shifts,
  income_entries: withOrg(incomeEntries),
  expense_entries: withOrg(expenseEntries),
  expense_categories: withOrg(categories),
  recurring_expenses: withOrg(recurring),
  recurring_expense_occurrences: [],
  wb_deductions: withOrg(deductions),
  wb_deduction_events: withOrg(deductionEvents),
  bonuses: withOrg(bonuses),
  employee_penalties: withOrg(penalties),
  salary_payments: withOrg(payments),
  tax_settings: [{ organization_id: 'org-1', rate: 6, enabled: true }],
  enabled_modules: modules,
  entry_presets: [],
  shift_templates: [],
  shift_requests: withOrg(shiftRequests),
  vacations: withOrg(vacations),
  notification_reads: [],
  // Фаза 7. Ставка по умолчанию и бот на Ленина; на остальных точках бота нет.
  salary_rates: withOrg([{ id: 'rate1', name: 'Основная', payment_type: 'SHIFT', rate_kopecks: 200000, monthly_norm_days: 22, is_default: true, archived_at: null }]),
  telegram_integrations: withOrg([{ id: 'tg1', status: 'CONNECTED', bot_username: 'pvz_lenina_bot', last_error: null, pickup_point_id: 'p1' }]),
  // Фаза 6. Представление с безопасными полями — то, что сотрудник видит о коллегах.
  employees_public: employees.map(row => ({ id: row.id, organization_id: 'org-1', full_name: row.full_name, status: row.status })),
  wb_deduction_parts: withOrg(deductionParts),
  // Ирина уже в приложении, Дмитрию код отправлен, остальным — нет.
  employee_invitations: withOrg([
    { id: 'inv1', employee_id: 'e1', code: 'HQR-4TW', status: 'ACCEPTED', expires_at: `${MONTH}-10T10:00:00+03:00`, accepted_at: `${MONTH}-02T12:00:00+03:00`, created_at: `${MONTH}-01T10:00:00+03:00` },
    { id: 'inv2', employee_id: 'e2', code: 'KMR-7PX', status: 'SENT', expires_at: '2026-10-02T10:00:00+03:00', accepted_at: null, created_at: `${MONTH}-18T09:00:00+03:00` },
  ]),
  payout_settings: [{ organization_id: 'org-1', advance_day: 15, payday: 5, advance_mode: 'CALC', advance_sum_kopecks: 0 }],
}
