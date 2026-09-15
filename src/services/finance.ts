import dayjs from 'dayjs'
import type { EntryKind, ExpenseCategory, RecurringExpense, RecurringExpenseOccurrence, Transaction } from '../entities/types'
import { monthEnd, monthStart, today } from '../shared/dates'
import { client, organizationId } from './org'

interface IncomeRow { id:string; pickup_point_id:string; date:string; category:string; amount_kopecks:number; description:string | null }
interface ExpenseRow { id:string; pickup_point_id:string | null; date:string; amount_kopecks:number; description:string | null; expense_categories:{ name:string } | null }

export async function listExpenseCategories(includeArchived = false):Promise<ExpenseCategory[]> {
  const organization_id = await organizationId()
  let query = client().from('expense_categories').select('id,name,archived_at').eq('organization_id', organization_id).order('name')
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data as { id:string; name:string; archived_at:string | null }[]).map(row => ({ id: row.id, name: row.name, archivedAt: row.archived_at }))
}

/** Категория расхода создаётся по имени, если такой ещё нет. */
export async function ensureExpenseCategory(name:string):Promise<string> {
  const db = client()
  const organization_id = await organizationId()
  const trimmed = name.trim()
  const existing = await db.from('expense_categories').select('id').eq('organization_id', organization_id).eq('name', trimmed).limit(1)
  if (existing.error) throw existing.error
  if (existing.data?.[0]) return existing.data[0].id as string
  const created = await db.from('expense_categories').insert({ organization_id, name: trimmed }).select('id').single()
  if (created.error) throw created.error
  return created.data.id as string
}

export async function renameExpenseCategory(id:string, name:string) {
  const { error } = await client().from('expense_categories').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function setExpenseCategoryArchived(id:string, archived:boolean) {
  const { error } = await client().from('expense_categories').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

export async function listTransactions(month:string, pickupPointId?:string):Promise<Transaction[]> {
  const db = client()
  const organization_id = await organizationId()
  const from = monthStart(month), to = monthEnd(month)

  let incomeQuery = db.from('income_entries').select('id,pickup_point_id,date,category,amount_kopecks,description').eq('organization_id', organization_id).gte('date', from).lt('date', to)
  let expenseQuery = db.from('expense_entries').select('id,pickup_point_id,date,amount_kopecks,description,expense_categories(name)').eq('organization_id', organization_id).gte('date', from).lt('date', to)
  if (pickupPointId) { incomeQuery = incomeQuery.eq('pickup_point_id', pickupPointId); expenseQuery = expenseQuery.eq('pickup_point_id', pickupPointId) }

  const [income, expense] = await Promise.all([incomeQuery, expenseQuery])
  if (income.error) throw income.error
  if (expense.error) throw expense.error

  const rows:Transaction[] = [
    ...(income.data as IncomeRow[]).map(row => ({ id: row.id, kind: 'INCOME' as const, date: row.date, pickupPointId: row.pickup_point_id, category: row.category, amountKopecks: row.amount_kopecks, description: row.description })),
    ...(expense.data as unknown as ExpenseRow[]).map(row => ({ id: row.id, kind: 'EXPENSE' as const, date: row.date, pickupPointId: row.pickup_point_id, category: row.expense_categories?.name ?? 'Без категории', amountKopecks: row.amount_kopecks, description: row.description })),
  ]
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export interface TransactionInput { kind:EntryKind; pickupPointId:string; category:string; amountKopecks:number; date?:string; description?:string }

export async function createTransaction(input:TransactionInput) {
  const db = client()
  const organization_id = await organizationId()
  const date = input.date ?? today()
  if (input.kind === 'INCOME') {
    const { error } = await db.from('income_entries').insert({ organization_id, pickup_point_id: input.pickupPointId, date, category: input.category.trim(), amount_kopecks: input.amountKopecks, description: input.description?.trim() || null })
    if (error) throw error
    return
  }
  const category_id = await ensureExpenseCategory(input.category)
  const { error } = await db.from('expense_entries').insert({ organization_id, category_id, pickup_point_id: input.pickupPointId, date, amount_kopecks: input.amountKopecks, description: input.description?.trim() || null })
  if (error) throw error
}

export async function updateTransaction(id:string, input:TransactionInput) {
  const db = client()
  const date = input.date ?? today()
  const patch = { pickup_point_id: input.pickupPointId, date, amount_kopecks: input.amountKopecks, description: input.description?.trim() || null, updated_at: new Date().toISOString() }
  if (input.kind === 'INCOME') {
    const { error } = await db.from('income_entries').update({ ...patch, category: input.category.trim() }).eq('id', id)
    if (error) throw error
    return
  }
  const category_id = await ensureExpenseCategory(input.category)
  const { error } = await db.from('expense_entries').update({ ...patch, category_id }).eq('id', id)
  if (error) throw error
}

export async function deleteTransaction(kind:EntryKind, id:string) {
  const { error } = await client().from(kind === 'INCOME' ? 'income_entries' : 'expense_entries').delete().eq('id', id)
  if (error) throw error
}

export async function listRecurringExpenses():Promise<RecurringExpense[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('recurring_expenses')
    .select('id,pickup_point_id,category_id,amount_kopecks,day_of_month,description,active,expense_categories(name)')
    .eq('organization_id', organization_id).order('day_of_month')
  if (error) throw error
  return (data as unknown as { id:string; pickup_point_id:string; category_id:string; amount_kopecks:number; day_of_month:number; description:string|null; active:boolean; expense_categories:{ name:string }|null }[]).map(row => ({
    id:row.id, pickupPointId:row.pickup_point_id, categoryId:row.category_id, category:row.expense_categories?.name ?? 'Без категории', amountKopecks:row.amount_kopecks,
    dayOfMonth:row.day_of_month, description:row.description, active:row.active,
  }))
}

export async function createRecurringExpense(input:{ pickupPointId:string; category:string; amountKopecks:number; dayOfMonth:number; description?:string }) {
  const organization_id = await organizationId(), category_id = await ensureExpenseCategory(input.category)
  const { error } = await client().from('recurring_expenses').insert({ organization_id, pickup_point_id:input.pickupPointId, category_id, amount_kopecks:input.amountKopecks, frequency:'MONTHLY', day_of_month:input.dayOfMonth, description:input.description?.trim() || null })
  if (error) throw error
}

export async function listRecurringOccurrences(month:string):Promise<RecurringExpenseOccurrence[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('recurring_expense_occurrences').select('id,recurring_expense_id,due_on,status,expense_entry_id')
    .eq('organization_id', organization_id).gte('due_on', `${month}-01`).lt('due_on', dayjs(`${month}-01`).add(1,'month').format('YYYY-MM-DD'))
  if (error) throw error
  return (data as { id:string; recurring_expense_id:string; due_on:string; status:RecurringExpenseOccurrence['status']; expense_entry_id:string|null }[]).map(row => ({ id:row.id, recurringExpenseId:row.recurring_expense_id, dueOn:row.due_on, status:row.status, expenseEntryId:row.expense_entry_id }))
}

export function recurringDueDate(month:string, dayOfMonth:number) {
  const first = dayjs(`${month}-01`), day = Math.min(dayOfMonth, first.daysInMonth())
  return first.date(day).format('YYYY-MM-DD')
}

export async function confirmRecurringExpense(id:string, dueOn:string) {
  const { error } = await client().rpc('confirm_recurring_expense', { p_recurring_id:id, p_due_on:dueOn })
  if (error) throw error
}

export async function skipRecurringExpense(id:string, dueOn:string) {
  const organization_id = await organizationId()
  const { error } = await client().from('recurring_expense_occurrences').upsert({ organization_id, recurring_expense_id:id, due_on:dueOn, status:'SKIPPED', resolved_at:new Date().toISOString() }, { onConflict:'recurring_expense_id,due_on' })
  if (error) throw error
}
