import { useNavigate } from 'react-router-dom'
import { Card } from '../../shared/kit/Card'
import { Button } from '../../shared/kit/Button'
import { EmptyState } from '../../shared/kit/Misc'

/**
 * Аккаунт вошёл в кабинет, но не связан с карточкой сотрудника — так бывает у владельца,
 * который открыл /me, или если приглашение отозвали. Пустые нули вместо объяснения
 * выглядели бы как «вам ничего не начислено». Код вводится тут же, без выхода из аккаунта:
 * `/join` для вошедшего просто принимает приглашение.
 */
export function NotLinked() {
  const navigate = useNavigate()
  return <Card>
    <EmptyState
      title="Аккаунт не связан с сотрудником"
      sub="Попросите владельца ПВЗ прислать код приглашения — он есть в вашей карточке сотрудника"
      action={<Button variant="secondary" onClick={() => navigate('/join')}>Ввести код приглашения</Button>}
    />
  </Card>
}
