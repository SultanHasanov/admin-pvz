import type { FeedKind, FeedRead } from '../entities/notifications'
import { client } from './org'

/**
 * Отметки прочтения. Единственное, что хранится из всей ленты: сама лента считается
 * на клиенте из того, что уже есть в базе (см. `entities/notifications.ts`).
 *
 * Таблица без `organization_id` — она про пользователя, а не про организацию,
 * поэтому здесь `auth.getUser()`, а не `organizationId()`.
 */
async function userId() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Войдите в аккаунт')
  return data.user.id
}

export async function listNotificationReads():Promise<FeedRead[]> {
  const { data, error } = await client().from('notification_reads').select('kind,ref_id')
  if (error) throw error
  return (data as { kind:FeedKind; ref_id:string }[]).map(row => ({ kind: row.kind, refId: row.ref_id }))
}

/** Один upsert на всю пачку: колокольчик гасит всё видимое разом. */
export async function markNotificationsRead(items:FeedRead[]) {
  if (!items.length) return
  const user_id = await userId()
  const { error } = await client().from('notification_reads').upsert(
    items.map(item => ({ user_id, kind: item.kind, ref_id: item.refId })),
    { onConflict: 'user_id,kind,ref_id' },
  )
  if (error) throw error
}
