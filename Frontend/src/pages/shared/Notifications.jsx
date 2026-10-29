import { t } from "../../i18n/I18nProvider"
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { post } from '../../api/client'
import { PageHeader, Card, Button, EmptyState, cx } from '../../components/ui'
import { notificationsFor } from '../../services/selectors'
import { relativeDay } from '../../utils/date'

export default function Notifications() {
  const { state, dispatch, today } = useStore()
  const navigate = useNavigate()
  const list = notificationsFor(state)
  const unread = list.filter((n) => !n.read)
  // Update the screen at once, and the server in the background.
  const markRead = (ids) => { dispatch({ type: 'MARK_NOTIFICATIONS_READ', ids }); post('/notifications/read', { ids }).catch(() => {}) }
  const open = (n) => { if (!n.read) markRead([n.id]); if (n.link) navigate(n.link) }
  return (
    <div>
      <PageHeader title={t("Notifications")} subtitle={t("{n} unread", { n: unread.length })} actions={unread.length > 0 && <Button variant="secondary" icon={CheckCheck} onClick={() => markRead(unread.map((n) => n.id))}>{t("Mark all read")}</Button>} />
      <Card>
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-start hover:bg-ivory-50 sm:px-5', !n.read && 'bg-gold-50/40')}>
                  <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.read ? 'bg-ivory-100 text-ink-muted' : 'bg-primary-700 text-white')}><Bell size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className={cx('text-[14px] text-forest', !n.read && 'font-bold')}>{t(n.title)}</span><span className="shrink-0 text-[12px] text-ink-muted">{relativeDay(n.date, today)}</span></span>
                    <span className="block text-[13px] text-ink-muted">{t(n.body)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Bell} title={t("No notifications")} />}
      </Card>
    </div>
  )
}
