import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Pill } from '../shared/kit/ListRow'
import { Button } from '../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { toastDone, toastError } from '../shared/kit/Toaster'
import type { Tone } from '../shared/kit/tokens'
import type { InvitationStatus } from '../entities/types'
import { keys } from '../services/queries'
import { createInvitation, getInvitation, inviteLink, revokeInvitation } from '../services/invitations'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { IconSend, StatusIcon } from '../shared/kit/icons'

const STATUS:Record<InvitationStatus | 'NONE' | 'EXPIRED', { label:string; tone:Tone }> = {
  ACCEPTED: { label: 'принято', tone: 'ok' },
  SENT: { label: 'отправлено', tone: 'warn' },
  REVOKED: { label: 'отозвано', tone: 'neutral' },
  EXPIRED: { label: 'истекло', tone: 'neutral' },
  NONE: { label: 'не отправлено', tone: 'neutral' },
}

/**
 * Приглашение сотрудника в приложение: код и ссылка.
 *
 * Код выпускает база (RPC), а не браузер: он уникален по всей базе, и прежний живой код
 * отзывается в той же транзакции. Сам код читать может только владелец — у сотрудника
 * доступа к таблице нет, он лишь вводит код.
 */
export default function Invite() {
  const { id = '' } = useParams()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const invitation = useQuery({ queryKey: keys.invitation(id), queryFn: () => getInvitation(id), enabled: !!id })

  const employee = totals.staff.find(person => person.id === id)
  const first = employee?.fullName.split(' ')[0] ?? 'сотрудника'

  const issue = useWrite({
    run: () => createInvitation(id),
    invalidate: [keys.invitation(id)],
    done: 'Новый код готов — прежний больше не работает',
  })
  const revoke = useWrite({
    run: () => revokeInvitation(id),
    invalidate: [keys.invitation(id)],
    done: 'Приглашение отозвано',
  })

  const row = invitation.data
  const expired = row?.status === 'SENT' && dayjs(row.expiresAt).isBefore(dayjs())
  const state = !row ? 'NONE' : expired ? 'EXPIRED' : row.status
  const live = row?.status === 'SENT' && !expired

  async function copy(text:string, what:string) {
    try { await navigator.clipboard.writeText(text); toastDone(`${what} скопирован`) }
    catch { toastError('Не удалось скопировать — выделите текст вручную') }
  }

  async function share() {
    if (!row) return
    const text = `Приглашение в «Пункт»: ${inviteLink(row.code)} · код ${row.code}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Приглашение в «Пункт»', text }); return } catch { /* отменили */ }
    } else await copy(text, 'Текст приглашения')
  }

  const header = <Header title="Приглашение" onBack={canBack ? back : undefined}/>
  if (totals.loading || invitation.isLoading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (!employee) return <Screen header={header}><Card><EmptyState title="Сотрудник не найден"/></Card></Screen>

  return <Screen header={header}>
    {invitation.error && <div className="mb-3"><ErrorNote error={invitation.error}/></div>}

    <Card className="p-[18px] text-center">
      <div className="text-act text-muted">Код приглашения для {first}</div>
      {live
        ? <>
          <div className="mt-[9px] mb-1 font-mono text-code font-medium tracking-[0.16em]">{row!.code}</div>
          <div className="text-sub break-all text-muted">{inviteLink(row!.code)}</div>
          <div className="mt-1 text-sub text-muted">Действует до {dayjs(row!.expiresAt).format('D MMMM')}</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void copy(row!.code, 'Код')}>Скопировать</Button>
            <Button onClick={() => void share()}><span className="inline-flex items-center gap-2"><IconSend/>В мессенджер</span></Button>
          </div>
        </>
        : <div className="mt-3">
          <div className="mb-4 text-row leading-[1.45] text-muted">
            {state === 'ACCEPTED'
              ? `${first} уже вошёл в приложение и видит свой график и деньги.`
              : 'Сотрудник введёт код на экране входа или откроет ссылку — и увидит свой график, смены и деньги.'}
          </div>
          <Button block disabled={issue.isPending} onClick={() => issue.mutate(undefined as void)}>
            {state === 'ACCEPTED' ? 'Выпустить новый код' : 'Создать код'}
          </Button>
        </div>}
    </Card>

    <Card className="mt-3 flex items-center gap-3 px-4 py-[14px]">
      <StatusIcon status={state === 'ACCEPTED' ? 'done' : state === 'SENT' ? 'waiting' : state === 'NONE' ? 'locked' : 'warning'} size={32}/>
      <div className="flex-1 text-row">Статус приглашения</div>
      <Pill tone={STATUS[state].tone}>{STATUS[state].label}</Pill>
    </Card>

    {live && <>
      <Button block variant="secondary" className="mt-3" disabled={issue.isPending} onClick={() => issue.mutate(undefined as void)}>
        Выпустить новый код
      </Button>
      <Button
        block
        variant="danger"
        className="mt-2"
        disabled={revoke.isPending}
        onClick={() => open('confirm', {
          text: `Отозвать приглашение ${employee.fullName}? Код перестанет работать, сотрудник останется в графике.`,
          yesLabel: 'Отозвать',
          tone: 'bad',
          onYes: () => revoke.mutate(undefined as void),
        })}
      >Отозвать приглашение</Button>
    </>}
  </Screen>
}
