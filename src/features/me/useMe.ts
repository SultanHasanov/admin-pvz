import { useCallback, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { keys } from '../../services/queries'
import { currentEmployeeId } from '../../services/org'
import { listColleagues, listEmployees } from '../../services/employees'

/** «Ирина Соколова» → «Ирина С.»: так прототип подписывает напарника в смене. */
export const shortName = (fullName:string) => {
  const [first, last] = fullName.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

/**
 * Кто я в приложении сотрудника.
 *
 * Своя карточка читается из `employees` — политика отдаёт сотруднику ровно его строку,
 * вместе с точками и ставкой. Имена коллег — из `employees_public`, где нет телефонов.
 * Ключ `employees()` общий с владельцем, но это не конфликт: у одного пользователя
 * одна роль, а при смене пользователя кэш сбрасывается целиком (см. App.tsx).
 */
export function useMe() {
  const [me, employees, colleagues] = useQueries({
    queries: [
      { queryKey: keys.me, queryFn: currentEmployeeId },
      { queryKey: keys.employees(), queryFn: () => listEmployees() },
      { queryKey: keys.colleagues, queryFn: listColleagues },
    ],
  })

  const employeeId = me.data ?? null
  const employee = useMemo(
    () => employees.data?.find(row => row.id === employeeId),
    [employees.data, employeeId])

  const nameOf = useCallback(
    (id:string) => colleagues.data?.find(row => row.id === id)?.fullName ?? 'Сотрудник',
    [colleagues.data])

  return {
    employeeId,
    employee,
    nameOf,
    loading: me.isLoading || employees.isLoading,
    error: me.error ?? employees.error ?? null,
  }
}
