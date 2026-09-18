import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import type { SheetPropsMap } from '../app/sheets'

/**
 * Шторка-меню: список действий, к которым ведёт одна кнопка. В прототипе так открываются
 * мастер графика, шаблоны, копирование недели и «поделиться» из плюса на экране графика.
 */
export default function MenuSheet({ rows, close }:SheetPropsMap['menu'] & { close:() => void }) {
  return <Card>
    <List>
      {rows.map(row => <ListRow
        key={row.title}
        title={<span className={row.tone === 'bad' ? 'text-bad' : undefined}>{row.title}</span>}
        sub={row.sub}
        chevron
        align={row.sub ? 'start' : 'center'}
        onClick={() => { close(); row.onClick() }}
      />)}
    </List>
  </Card>
}
