import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bell, X, LogOut, MoreHorizontal, ShieldCheck } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { NAV, PAGE_TITLES } from '../../constants/navigation'
import { ROLE_LABELS } from '../../constants/labels'
import { sessionUser, notificationsFor } from '../../services/selectors'
import { Avatar, IconButton, Logo, cx } from '../ui'
import { useAuth } from '../../context/AuthContext'
import ErrorBoundary from '../feedback/ErrorBoundary'
import LanguageToggle from "./LanguageToggle"
import { useI18n } from "../../i18n/I18nProvider"

function titleFor(pathname) {
  return PAGE_TITLES.find(([p]) => pathname.startsWith(p))?.[1] || ''
}

function Brand({ compact }) {
  const { state } = useStore()
  return (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
      <Logo size={compact ? 34 : 40} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-extrabold text-forest">{compact ? state.settings.shortName || state.settings.brandName : state.settings.brandName}</span>
        {!compact && <span className="block truncate text-[11.5px] font-semibold text-ink-muted">{t(state.settings.tagline)}</span>}
      </span>
    </Link>
  )
}

function NavList({ role, onNavigate }) {
  return (
    <nav aria-label={t("Main")} className="space-y-5">
      {NAV[role].sections.map((sec) => (
        <div key={sec.title}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted/80">{t(sec.title)}</p>
          <ul className="space-y-0.5">
            {sec.items.map((it) => (
              <li key={it.to}>
                <NavLink to={it.to} end={it.end} onClick={onNavigate}
                  className={({ isActive }) => cx('group relative flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition',
                    isActive ? 'bg-primary-700 text-white shadow-sm' : 'text-ink-soft hover:bg-sage-100 hover:text-forest')}>
                  {({ isActive }) => (
                    <>
                      <it.icon size={18} className={isActive ? 'text-gold-300' : 'text-primary-600/80'} aria-hidden />
                      {t(it.label)}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function AppShell() {
  const { state, idx } = useStore()
  const auth = useAuth()
  // Navigation follows the account's persona (Principal and Warden reuse admin screens).
  const role = state.session.persona || state.session.role
  // Name comes from the signed-in account; the subtitle still comes from the demo record.
  const demoUser = sessionUser(state, idx)
  const user = { ...demoUser, name: auth.user.displayName, subtitle: role !== state.session.role ? ROLE_LABELS[role] : demoUser?.subtitle }
  const location = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const { isRTL } = useI18n()
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const unread = notificationsFor(state).filter((n) => !n.read).length
  const title = titleFor(location.pathname)

  useEffect(() => { setDrawer(false); setMenu(false) }, [location.pathname])
  useEffect(() => { document.title = `${title ? `${t(title)} · ` : ''}${state.settings.brandName}` }, [title, state.settings.brandName])

  const logout = () => auth.logout().then(() => navigate('/login'))

  return (
    <div className="min-h-dvh bg-ivory">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-[264px] flex-col border-e border-line bg-white/70 backdrop-blur lg:flex">
        <div className="px-5 pb-4 pt-5"><Brand /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-none" data-lenis-prevent><NavList role={role} /></div>
        <div className="border-t border-line p-3">
          <div className="pattern-stars flex items-center gap-3 rounded-2xl bg-sage-50 p-3">
            <Avatar name={user?.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-forest">{user?.name}</p>
              <p className="truncate text-[12px] text-ink-muted">{t(user?.subtitle)}</p>
            </div>
            <IconButton icon={LogOut} label={t("Sign out")} onClick={logout} className="h-9 w-9" />
          </div>
        </div>
      </aside>

      <div className="lg:ps-[264px]">
        {/* Top header */}
        <header className="no-print sticky top-0 z-40 border-b border-line bg-ivory/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:h-16 sm:px-6">
            <div className="lg:hidden"><Brand compact /></div>
            <h2 className="hidden truncate text-[17px] font-bold lg:block">{t(title)}</h2>
            <div className="flex-1" />
            <LanguageToggle className="hidden xs:inline-flex" />
            <IconButton icon={Bell} label={unread ? t("Notifications ({n} unread)", { n: unread }) : t("Notifications")} badge={unread || null} onClick={() => navigate('/notifications')} />
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} className="flex h-11 items-center gap-2 rounded-xl px-1 hover:bg-sage-100" aria-haspopup="menu" aria-expanded={menu} aria-label={t("Account menu")}>
                <Avatar name={user?.name} size={34} />
                <span className="hidden text-start leading-tight md:block">
                  <span className="block max-w-[160px] truncate text-[13px] font-bold text-forest">{user?.name}</span>
                  <span className="block text-[11.5px] text-ink-muted">{t(ROLE_LABELS[role])}</span>
                </span>
              </button>
              <AnimatePresence>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
                    <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                      className="absolute end-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
                      <div className="border-b border-line px-4 py-3">
                        <p className="truncate font-bold text-forest">{user?.name}</p>
                        <p className="text-[12.5px] text-ink-muted">{auth.user.email || auth.user.username}</p>
                      </div>
                      <Link role="menuitem" to="/account/security" className="flex min-h-[44px] w-full items-center gap-2 px-4 text-start text-[14px] font-semibold text-ink-soft hover:bg-ivory-50">
                        <ShieldCheck size={15} className="text-primary-600" /> {t("Account security")}
                      </Link>
                      <button role="menuitem" type="button" onClick={logout} className="flex min-h-[44px] w-full items-center gap-2 border-t border-line px-4 text-start text-[14px] font-semibold text-clay-600 hover:bg-clay-50">
                        <LogOut size={15} /> {t("Sign out")}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-12">
          <motion.div key={location.pathname} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
          </motion.div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label={t("Quick navigation")} className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-safe backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV[role].bottom.map((it) => (
            <li key={it.to}>
              <NavLink to={it.to} end={it.to === '/sabaq'} className={({ isActive }) => cx('flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition', isActive ? 'text-primary-700' : 'text-ink-muted')}>
                {({ isActive }) => it.primary ? (
                  <>
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-lift ring-4 ring-ivory"><it.icon size={22} /></span>
                    <span>{t(it.label)}</span>
                  </>
                ) : (
                  <>
                    <span className={cx('flex h-8 w-12 items-center justify-center rounded-full transition', isActive && 'bg-primary-50')}><it.icon size={20} /></span>
                    <span>{t(it.label)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setDrawer(true)} className="flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-muted" aria-label={t("More menu")}>
              <span className="flex h-8 w-12 items-center justify-center"><MoreHorizontal size={20} /></span>
              {t("More")}
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={t("Menu")}>
            <motion.div className="absolute inset-0 bg-forest/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.div initial={{ x: isRTL ? '-100%' : '100%' }} animate={{ x: 0 }} exit={{ x: isRTL ? '-100%' : '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 end-0 flex w-[86%] max-w-[340px] flex-col bg-white shadow-pop">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <Brand compact />
                <IconButton icon={X} label={t("Close menu")} onClick={() => setDrawer(false)} />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4" data-lenis-prevent>
                <div className="mb-5"><p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted/80">Language / زبان</p><LanguageToggle full className="flex w-full" /></div>
                <Link to="/account/security" onClick={() => setDrawer(false)} className="mb-5 flex min-h-[44px] items-center gap-3 rounded-xl border border-line px-3 text-[14px] font-semibold text-ink-soft hover:bg-sage-100">
                  <ShieldCheck size={18} className="text-primary-600" aria-hidden /> {t("Account security")}
                </Link>
                <NavList role={role} onNavigate={() => setDrawer(false)} />
              </div>
              <div className="border-t border-line p-3 pb-safe">
                <div className="flex items-center gap-3 px-1">
                  <Avatar name={user?.name} size={38} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-bold">{user?.name}</p><p className="truncate text-[12px] text-ink-muted">{t(ROLE_LABELS[role])}</p></div>
                  <IconButton icon={LogOut} label={t("Sign out")} onClick={logout} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
