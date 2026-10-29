import { t } from "../../i18n/I18nProvider"
import { useActiveChild } from '../../hooks/useScope'
import { useStore } from '../../context/DemoStore'
import { Avatar, cx } from '../ui'

// Parent-only selector for linked children. Each child's data stays separate.
export default function ChildSwitcher({ className }) {
  const { idx } = useStore()
  const { child, children, select, isParent } = useActiveChild()
  if (!isParent || children.length < 2) return null
  return (
    <div className={cx('-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0', className)}>
      <div role="tablist" aria-label={t("Select child")} className="inline-flex gap-2">
        {children.map((c) => {
          const active = c.id === child?.id
          return (
            <button key={c.id} type="button" role="tab" aria-selected={active} onClick={() => select(c.id)}
              className={cx('flex min-h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border py-1.5 ps-1.5 pe-4 text-start transition',
                active ? 'border-primary-700 bg-primary-700 text-white shadow-lift' : 'border-line bg-white text-forest hover:border-primary-300')}>
              <Avatar name={c.name} size={36} className={active ? 'ring-2 ring-white/40' : ''} />
              <span>
                <span className="block text-[14px] font-bold leading-tight">{c.name.split(' ')[0]}</span>
                <span className={cx('block text-[11.5px]', active ? 'text-sage-200' : 'text-ink-muted')}>{t(idx.groups[c.groupId]?.short)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
