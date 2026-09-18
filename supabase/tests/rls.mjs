/**
 * Проверка прав по ролям на живой базе.
 *
 * Заводит три сессии — владелец, менеджер, сотрудник — и на каждую политику проверяет
 * пару «вижу своё / не вижу чужого». Это условие выпуска кабинета сотрудника: ошибка
 * в RLS означает либо утечку зарплат, либо возможность сотруднику править свою оплату.
 *
 * Запуск (только против тестовой базы — локальный стек или отдельный проект):
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
 *   SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... \
 *   npm run db:rls
 *
 * Имена переменных намеренно свои: так набор не запустится против боевого проекта,
 * прописанного в .env.local.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error('Нужны SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY и SUPABASE_TEST_SERVICE_KEY.')
  process.exit(2)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const stamp = Date.now()
const password = `Test-${stamp}-pass`

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok    ${name}`)
  else { failures += 1; console.error(`  ОШИБКА ${name}${detail ? ` — ${detail}` : ''}`) }
}
const rows = result => result.data ?? []
const denied = result => Boolean(result.error) || rows(result).length === 0

async function signIn(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Не вошли как ${email}: ${error.message}`)
  return client
}

async function createUser(tag) {
  const email = `rls-${tag}-${stamp}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`Не создан пользователь ${email}: ${error.message}`)
  return { id: data.user.id, email }
}

const ids = {}

async function seed() {
  const ownerUser = await createUser('owner')
  const managerUser = await createUser('manager')
  const employeeUser = await createUser('employee')
  const strangerUser = await createUser('stranger')
  Object.assign(ids, { ownerUser, managerUser, employeeUser, strangerUser })

  // Организацию создаёт сам владелец — тем же путём, что и в приложении.
  const ownerClient = await signIn(ownerUser.email)
  const { data: organizationId, error } = await ownerClient.rpc('create_organization_with_owner', {
    p_name: `RLS ${stamp}`, p_point_name: 'Тестовый ПВЗ', p_point_address: 'ул. Тестовая, 1', p_timezone: 'Europe/Moscow',
  })
  if (error) throw new Error(`Организация не создана: ${error.message}`)
  ids.organizationId = organizationId

  const { data: points } = await admin.from('pickup_points').select('id').eq('organization_id', organizationId)
  ids.pointId = points[0].id

  const { data: employees, error: employeeError } = await admin.from('employees').insert([
    { organization_id: organizationId, full_name: 'Сотрудник Тестовый', phone: '+7 900 000-00-01' },
    { organization_id: organizationId, full_name: 'Коллега Тестовый', phone: '+7 900 000-00-02' },
  ]).select('id')
  if (employeeError) throw new Error(`Сотрудники не созданы: ${employeeError.message}`)
  ids.employeeId = employees[0].id
  ids.colleagueId = employees[1].id

  await admin.from('employee_pickup_points').insert(employees.map(row => ({ employee_id: row.id, pickup_point_id: ids.pointId })))

  await admin.from('organization_members').insert([
    { organization_id: organizationId, user_id: managerUser.id, role: 'MANAGER' },
    { organization_id: organizationId, user_id: employeeUser.id, role: 'EMPLOYEE', employee_id: ids.employeeId },
  ])

  const day = '2026-09-10'
  const { data: shifts, error: shiftError } = await admin.from('shifts').insert([
    { organization_id: organizationId, pickup_point_id: ids.pointId, employee_id: ids.employeeId, planned_start: `${day}T06:00:00Z`, planned_end: `${day}T18:00:00Z` },
    { organization_id: organizationId, pickup_point_id: ids.pointId, employee_id: ids.colleagueId, planned_start: `${day}T06:00:00Z`, planned_end: `${day}T18:00:00Z` },
  ]).select('id')
  if (shiftError) throw new Error(`Смены не созданы: ${shiftError.message}`)
  ids.myShiftId = shifts[0].id
  ids.colleagueShiftId = shifts[1].id

  await admin.from('income_entries').insert({ organization_id: organizationId, pickup_point_id: ids.pointId, date: day, category: 'Выручка WB', amount_kopecks: 100000 })
  await admin.from('salary_payments').insert([
    { organization_id: organizationId, employee_id: ids.employeeId, date: day, accrual_month: '2026-09-01', amount_kopecks: 50000, kind: 'ADVANCE' },
    { organization_id: organizationId, employee_id: ids.colleagueId, date: day, accrual_month: '2026-09-01', amount_kopecks: 70000, kind: 'ADVANCE' },
  ])

  const { data: deduction } = await admin.from('wb_deductions').insert({
    organization_id: organizationId, pickup_point_id: ids.pointId, event_at: `${day}T10:00:00Z`,
    amount_kopecks: 240000, reason: 'Пересорт при выдаче', status: 'EMPLOYEE_LIABILITY',
  }).select('id').single()
  ids.deductionId = deduction.id
  await admin.from('wb_deduction_parts').insert({ deduction_id: deduction.id, employee_id: ids.employeeId, organization_id: organizationId, amount_kopecks: 100000 })

  const { data: other } = await admin.from('wb_deductions').insert({
    organization_id: organizationId, pickup_point_id: ids.pointId, event_at: `${day}T11:00:00Z`,
    amount_kopecks: 90000, reason: 'Чужое удержание', status: 'NEW',
  }).select('id').single()
  ids.otherDeductionId = other.id

  // Удержание по-старому: целиком на сотруднике, без частей. Сотрудник должен его видеть —
  // оно вычитается из его зарплаты.
  const { data: assigned } = await admin.from('wb_deductions').insert({
    organization_id: organizationId, pickup_point_id: ids.pointId, employee_id: ids.employeeId, event_at: `${day}T12:00:00Z`,
    amount_kopecks: 50000, reason: 'Недостача', status: 'EMPLOYEE_LIABILITY',
  }).select('id').single()
  ids.assignedDeductionId = assigned.id

  await admin.from('payout_settings').insert({ organization_id: organizationId, advance_day: 15, payday: 5 })

  return { ownerClient }
}

async function checkEmployee() {
  console.log('\nСотрудник')
  const client = await signIn(ids.employeeUser.email)

  check('не видит выручку', denied(await client.from('income_entries').select('id')))
  check('не видит расходы', denied(await client.from('expense_entries').select('id')))
  check('не видит налоги', denied(await client.from('tax_settings').select('organization_id')))
  check('видит дни выплат', rows(await client.from('payout_settings').select('organization_id')).length === 1)
  const payday = await client.from('payout_settings').update({ payday: 1 }).eq('organization_id', ids.organizationId).select('organization_id')
  check('не меняет дни выплат', denied(payday))
  check('не видит справочник ставок', denied(await client.from('salary_rates').select('id')))

  const cards = rows(await client.from('employees').select('id,phone'))
  check('видит только свою карточку', cards.length === 1 && cards[0].id === ids.employeeId, `получено строк: ${cards.length}`)
  const links = rows(await client.from('employee_pickup_points').select('employee_id'))
  check('видит свои привязки к точкам, чужие — нет', links.length === 1 && links[0].employee_id === ids.employeeId,
    `получено строк: ${links.length}`)

  const payments = rows(await client.from('salary_payments').select('employee_id'))
  check('видит свои выплаты', payments.length === 1 && payments[0].employee_id === ids.employeeId,
    `получено строк: ${payments.length}`)

  const colleagues = rows(await client.from('employees_public').select('id,full_name'))
  check('видит коллег по именам', colleagues.length === 2)

  const visible = rows(await client.from('shifts').select('id,employee_id'))
  check('видит свою смену и напарника в тот же день', visible.length === 2, `получено строк: ${visible.length}`)

  const update = await client.from('shifts').update({ pay_mode: 'HALF' }).eq('id', ids.myShiftId).select('id')
  check('не может править свою смену напрямую', denied(update))

  const start = await client.rpc('employee_start_shift', { p_shift_id: ids.myShiftId })
  check('может начать свою смену', !start.error, start.error?.message)
  const foreign = await client.rpc('employee_start_shift', { p_shift_id: ids.colleagueShiftId })
  check('не может начать чужую смену', Boolean(foreign.error))

  const request = await client.from('shift_requests').insert({
    organization_id: ids.organizationId, employee_id: ids.employeeId, pickup_point_id: ids.pointId,
    kind: 'SHIFT', date_from: '2026-09-25', date_to: '2026-09-25', reason: 'Болезнь',
  }).select('id')
  check('может отправить заявку за себя', !request.error, request.error?.message)

  const foreignRequest = await client.from('shift_requests').insert({
    organization_id: ids.organizationId, employee_id: ids.colleagueId,
    kind: 'SHIFT', date_from: '2026-09-25', date_to: '2026-09-25',
  }).select('id')
  check('не может отправить заявку за коллегу', Boolean(foreignRequest.error))

  const resolve = await client.rpc('resolve_shift_request', { p_request_id: rows(request)[0]?.id, p_status: 'APPROVED' })
  check('не может сам согласовать заявку', Boolean(resolve.error))

  const deductions = rows(await client.from('wb_deductions').select('id'))
  const seen = new Set(deductions.map(row => row.id))
  check('видит удержания со своей долей и назначенные на него целиком', seen.size === 2
    && seen.has(ids.deductionId) && seen.has(ids.assignedDeductionId), `получено строк: ${deductions.length}`)
  check('не видит чужое удержание', !seen.has(ids.otherDeductionId))

  const assignedDisagree = await client.from('wb_deduction_events').insert({
    organization_id: ids.organizationId, deduction_id: ids.assignedDeductionId,
    event_type: 'EMPLOYEE_DISAGREE', note: 'Не я', author_employee_id: ids.employeeId,
  }).select('id')
  check('может не согласиться с удержанием, назначенным целиком', !assignedDisagree.error, assignedDisagree.error?.message)

  const foreignDisagree = await client.from('wb_deduction_events').insert({
    organization_id: ids.organizationId, deduction_id: ids.otherDeductionId,
    event_type: 'EMPLOYEE_DISAGREE', note: 'Не я', author_employee_id: ids.employeeId,
  }).select('id')
  check('не может возражать по чужому удержанию', Boolean(foreignDisagree.error))

  const disagree = await client.from('wb_deduction_events').insert({
    organization_id: ids.organizationId, deduction_id: ids.deductionId,
    event_type: 'EMPLOYEE_DISAGREE', note: 'Не согласен', author_employee_id: ids.employeeId,
  }).select('id')
  check('может не согласиться со своим удержанием', !disagree.error, disagree.error?.message)

  const fakeEvent = await client.from('wb_deduction_events').insert({
    organization_id: ids.organizationId, deduction_id: ids.deductionId,
    event_type: 'STATUS_CHANGED', note: 'Отменено', author_employee_id: ids.employeeId,
  }).select('id')
  check('не может писать другие события удержания', Boolean(fakeEvent.error))
}

async function checkManager() {
  console.log('\nМенеджер')
  const client = await signIn(ids.managerUser.email)

  const income = await client.from('income_entries').insert({
    organization_id: ids.organizationId, pickup_point_id: ids.pointId, date: '2026-09-11',
    category: 'Платное хранение', amount_kopecks: 4200,
  }).select('id')
  check('вносит доход', !income.error, income.error?.message)

  const shift = await client.from('shifts').update({ pay_mode: 'HALF' }).eq('id', ids.colleagueShiftId).select('id')
  check('правит смену', rows(shift).length === 1, shift.error?.message)

  const rate = await client.from('salary_rates').insert({
    organization_id: ids.organizationId, name: 'Менеджерская ставка', payment_type: 'SHIFT', rate_kopecks: 300000,
  }).select('id')
  check('не заводит ставку', Boolean(rate.error))

  const tax = await client.from('tax_settings').update({ rate: 15 }).eq('organization_id', ids.organizationId).select('organization_id')
  check('не меняет налог', denied(tax))

  const modules = await client.from('enabled_modules').update({ enabled: false }).eq('organization_id', ids.organizationId).eq('module', 'salary').select('module')
  check('не выключает модули', denied(modules))

  const invitation = await client.rpc('create_employee_invitation', { p_employee_id: ids.employeeId })
  check('не выпускает приглашения', Boolean(invitation.error))
}

async function checkOwner(ownerClient) {
  console.log('\nВладелец')

  check('видит выручку', rows(await ownerClient.from('income_entries').select('id')).length >= 1)
  check('видит все выплаты', rows(await ownerClient.from('salary_payments').select('id')).length === 2)
  check('видит все смены', rows(await ownerClient.from('shifts').select('id')).length === 2)

  const tax = await ownerClient.from('tax_settings').update({ rate: 6, enabled: true }).eq('organization_id', ids.organizationId).select('organization_id')
  check('меняет налог', rows(tax).length === 1, tax.error?.message)

  const invitation = await ownerClient.rpc('create_employee_invitation', { p_employee_id: ids.colleagueId })
  check('выпускает приглашение', !invitation.error && /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(invitation.data ?? ''), invitation.error?.message)
  ids.invitationCode = invitation.data

  const parts = await ownerClient.rpc('set_deduction_parts', {
    p_deduction_id: ids.deductionId,
    p_parts: [{ employeeId: ids.employeeId, amountKopecks: 100000 }, { employeeId: ids.colleagueId, amountKopecks: 100000 }],
  })
  check('делит удержание между двумя', !parts.error, parts.error?.message)

  const tooMuch = await ownerClient.rpc('set_deduction_parts', {
    p_deduction_id: ids.deductionId,
    p_parts: [{ employeeId: ids.employeeId, amountKopecks: 999999 }],
  })
  check('не даёт разделить больше суммы удержания', Boolean(tooMuch.error))

  // 0020: замена меняет сотрудника, но не отменяет смену — иначе заменяющему нечего платить.
  const before = rows(await ownerClient.from('shifts').select('status').eq('id', ids.colleagueShiftId))[0]
  const replaced = await ownerClient.rpc('replace_shift', { p_shift_id: ids.colleagueShiftId, p_employee_id: ids.employeeId, p_reason: 'rls-test' })
  const after = rows(await ownerClient.from('shifts').select('status,employee_id').eq('id', ids.colleagueShiftId))[0]
  check('замена переписывает смену и сохраняет статус',
    !replaced.error && after?.employee_id === ids.employeeId && after?.status === before?.status,
    replaced.error?.message ?? `статус: ${before?.status} → ${after?.status}`)
  const history = rows(await ownerClient.from('shift_changes').select('previous_employee_id').eq('shift_id', ids.colleagueShiftId))
  check('замена попадает в историю', history.some(row => row.previous_employee_id === ids.colleagueId))
}

async function checkStranger() {
  console.log('\nЧужой пользователь')
  const client = await signIn(ids.strangerUser.email)

  check('не видит чужую организацию', denied(await client.from('organizations').select('id').eq('id', ids.organizationId)))
  check('не видит чужие смены', denied(await client.from('shifts').select('id')))
  check('не видит чужих сотрудников', denied(await client.from('employees_public').select('id')))

  // Неверный код — ответ { error }, а не исключение: иначе откатилась бы запись о попытке.
  const accept = await client.rpc('accept_employee_invitation', { p_code: 'ZZZ-999' })
  check('не принимает несуществующий код', !accept.error && Boolean(accept.data?.error), accept.error?.message)

  const real = await client.rpc('accept_employee_invitation', { p_code: ids.invitationCode })
  check('принимает выданное приглашение', !real.error, real.error?.message)

  const own = rows(await client.from('shifts').select('id,employee_id'))
  check('после приёма видит смены своей карточки', own.length >= 1, `получено строк: ${own.length}`)

  // Перебор кодов: после десяти неудачных попыток за час база отвечает отказом даже на новые.
  for (let attempt = 0; attempt < 10; attempt += 1) await client.rpc('accept_employee_invitation', { p_code: 'ZZZ-999' })
  const locked = await client.rpc('accept_employee_invitation', { p_code: 'ZZZ-998' })
  check('после десяти неудачных попыток приём закрыт на час', /Слишком много попыток/.test(locked.data?.error ?? ''),
    locked.error?.message ?? JSON.stringify(locked.data))
}

async function cleanup() {
  if (ids.organizationId) await admin.from('organizations').delete().eq('id', ids.organizationId)
  for (const key of ['ownerUser', 'managerUser', 'employeeUser', 'strangerUser']) {
    if (ids[key]) await admin.auth.admin.deleteUser(ids[key].id)
  }
}

try {
  const { ownerClient } = await seed()
  await checkEmployee()
  await checkManager()
  await checkOwner(ownerClient)
  await checkStranger()
} catch (error) {
  failures += 1
  console.error(`\nСбой набора: ${error.message}`)
} finally {
  await cleanup()
}

console.log(failures ? `\nПроваленных проверок: ${failures}` : '\nВсе проверки прав пройдены.')
process.exit(failures ? 1 : 0)
