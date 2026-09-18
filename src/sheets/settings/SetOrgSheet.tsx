import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { TextField } from '../../shared/kit/Field'
import { keys } from '../../services/queries'
import { getOrganization, renameOrganization } from '../../services/org'
import { useWrite } from '../../features/write'

/** Название организации — его видят сотрудники в приглашении. */
export default function SetOrgSheet({ close }:{ close:() => void }) {
  const organization = useQuery({ queryKey: keys.organization, queryFn: getOrganization })
  const [name, setName] = useState<string>()
  const value = name ?? organization.data?.name ?? ''

  const write = useWrite({
    run: () => renameOrganization(value),
    invalidate: [keys.organization],
    done: 'Название обновлено',
    onDone: close,
  })

  return <>
    <TextField label="Название" value={value} placeholder="ИП Ковалёв А. С." onChange={event => setName(event.target.value)}/>
    <Button block disabled={!value.trim() || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить</Button>
  </>
}
