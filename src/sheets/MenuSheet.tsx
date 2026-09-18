import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { currentTopSheet, type SheetPropsMap } from '../app/sheets'

/**
 * Шторка-меню: список действий, к которым ведёт одна кнопка. В прототипе так открываются
 * мастер графика, шаблоны, копирование недели и «поделиться» из плюса на экране графика.
 */
export default function MenuSheet({ rows, close }:SheetPropsMap['menu'] & { close:() => void }) {
  // Сначала действие, потом закрытие: если пункт открыл шторку, она уже подменила меню,
  // а если увёл на другой экран — стек сбросится сам. Закрываем только когда меню осталось
  // на месте, иначе «Назад» из close() гонялся бы с новым шагом истории.
  const pick = (action:() => void) => {
    const menu = currentTopSheet()
    const address = location.pathname + location.search
    action()
    if (currentTopSheet() === menu && location.pathname + location.search === address) close()
  }

  return <Card>
    <List>
      {rows.map(row => <ListRow
        key={row.title}
        title={<span className={row.tone === 'bad' ? 'text-bad' : undefined}>{row.title}</span>}
        sub={row.sub}
        chevron
        align={row.sub ? 'start' : 'center'}
        onClick={() => pick(row.onClick)}
      />)}
    </List>
  </Card>
}
