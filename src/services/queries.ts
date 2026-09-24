/**
 * Ключи кэша React Query в одном месте.
 *
 * Один экран грузит данные, другой после записи сбрасывает их — ключи обязаны совпадать
 * до символа, иначе данные загрузятся дважды и разъедутся после первой же правки.
 */
export const keys = {
  points: ['points'] as const,
  pointsAll: ['points', 'all'] as const,
  organization: ['organization'] as const,
  tax: ['tax'] as const,

  employees: (includeArchived = false) => ['employees', includeArchived] as const,
  salaryRules: ['salary-rules'] as const,
  salaryRates: (includeArchived = true) => ['salary-rates', includeArchived] as const,

  shifts: (month:string, pointId:string) => ['shifts', month, pointId] as const,
  shiftsRange: (from:string, to:string, pointId:string) => ['shifts', 'range', from, to, pointId] as const,
  upcomingShifts: ['upcoming-shifts'] as const,
  scheduleTemplates: ['schedule-templates'] as const,

  transactions: (month:string, pointId:string) => ['transactions', month, pointId] as const,
  categories: (includeArchived = false) => (includeArchived ? ['expense-categories', 'all'] : ['expense-categories']) as readonly string[],
  presets: (pointId:string) => ['presets', pointId] as const,
  recurring: ['recurring'] as const,
  recurringOccurrences: (month:string) => ['recurring-occurrences', month] as const,

  deductions: (month:string, pointId:string) => ['deductions', month, pointId] as const,
  newDeductions: ['new-deductions'] as const,
  deductionEvents: (deductionId:string) => ['deduction-events', deductionId] as const,

  bonuses: (month:string) => ['bonuses', month] as const,
  penalties: (month:string) => ['penalties', month] as const,
  payments: (month:string) => ['salary-payments', month] as const,

  telegram: ['telegram-integrations'] as const,
  /** Группа-получатель и расписание напоминаний одного бота. */
  telegramGroups: (integrationId:string) => ['telegram-bot', integrationId, 'groups'] as const,
  telegramSettings: (integrationId:string) => ['telegram-bot', integrationId, 'settings'] as const,
  wb: ['wb-integration'] as const,

  // Фаза 5: заявки и уведомления.
  /** Кто я в организации: employee_id участника. У владельца пусто. */
  me: ['me'] as const,
  /** `open` — только ждущие решения (лента владельца), `all` — вся история (кабинет сотрудника). */
  requests: (scope:'open' | 'all') => ['shift-requests', scope] as const,
  notificationReads: ['notification-reads'] as const,
  payoutSettings: ['payout-settings'] as const,

  // Фаза 6: кабинет сотрудника, приглашения, части удержаний.
  /** OWNER / MANAGER / EMPLOYEE — какую оболочку открыть. */
  role: ['member-role'] as const,
  /** Имена коллег из `employees_public`: сотруднику таблица employees закрыта. */
  colleagues: ['colleagues'] as const,
  invitation: (employeeId:string) => ['invitation', employeeId] as const,
  /** Части удержаний того же набора, что `deductions(month, pointId)`, либо `mine` у сотрудника. */
  deductionParts: (month:string, pointId:string) => ['deduction-parts', month, pointId] as const,
  /** Удержания без привязки к месяцу — экран «Мои удержания». */
  visibleDeductions: ['deductions', 'visible'] as const,
  /** Под префиксом событий удержаний: новая реплика инвалидирует и историю, и пометки. */
  myDisagreements: (employeeId:string) => ['deduction-events', 'disagree', employeeId] as const,
}

/**
 * Префиксы для сброса кэша после записи. Сбрасываем семейство целиком — все месяцы
 * и все точки: смена в сентябре меняет и главную, и ведомость, и график.
 *
 * Каждый префикс — первый элемент ключа из `keys` (сверяет queries.test.ts). Литерал
 * вроде `['shift']` вместо `['shifts']` не упал бы, а молча оставил на экране старые данные.
 */
export const scope = {
  points: ['points'],
  employees: ['employees'],
  salaryRules: ['salary-rules'],
  salaryRates: ['salary-rates'],
  shifts: ['shifts'],
  upcomingShifts: ['upcoming-shifts'],
  scheduleTemplates: ['schedule-templates'],
  transactions: ['transactions'],
  categories: ['expense-categories'],
  presets: ['presets'],
  recurring: ['recurring'],
  recurringOccurrences: ['recurring-occurrences'],
  deductions: ['deductions'],
  newDeductions: ['new-deductions'],
  deductionEvents: ['deduction-events'],
  deductionParts: ['deduction-parts'],
  bonuses: ['bonuses'],
  penalties: ['penalties'],
  payments: ['salary-payments'],
  requests: ['shift-requests'],
  telegram: ['telegram-integrations'],
  telegramBot: ['telegram-bot'],
} as const satisfies Record<string, readonly [string]>
