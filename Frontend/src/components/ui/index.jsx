import { forwardRef, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, Search, ChevronRight, Inbox } from 'lucide-react'
import { initials } from '../../utils/format'
import { t, t as tr } from "../../i18n/I18nProvider"

export const cx = (...c) => c.filter(Boolean).join(' ')

// ---------- Tone system ----------
export const TONES = {
  green: 'bg-primary-50 text-primary-700 ring-primary-200/60',
  gold: 'bg-gold-50 text-gold-700 ring-gold-200/70',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red: 'bg-clay-50 text-clay-700 ring-clay-100',
  blue: 'bg-slateblue-50 text-slateblue-600 ring-slateblue-100',
  neutral: 'bg-ivory-100 text-ink-soft ring-line',
  dark: 'bg-primary-700 text-white ring-primary-700',
}

export function Badge({ tone = 'neutral', children, className, icon: Icon }) {
  return (
    <span className={cx('chip ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon size={12} aria-hidden />}
      {t(children)}
    </span>
  )
}

export const Dot = ({ tone = 'green' }) => {
  const c = { green: 'bg-primary-500', gold: 'bg-gold-500', amber: 'bg-amber-500', red: 'bg-clay-500', blue: 'bg-slateblue-500', neutral: 'bg-ink-muted/50' }[tone]
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', c)} aria-hidden />
}

// ---------- Buttons ----------
const BTN = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 shadow-sm',
  secondary: 'bg-white text-forest border border-line-strong hover:bg-ivory-100 active:bg-ivory-200',
  soft: 'bg-sage-100 text-primary-800 hover:bg-sage-200 active:bg-sage-300',
  ghost: 'text-primary-700 hover:bg-sage-100 active:bg-sage-200',
  gold: 'bg-gold-500 text-white hover:bg-gold-600 shadow-sm',
  danger: 'bg-clay-500 text-white hover:bg-clay-600',
  'danger-soft': 'bg-clay-50 text-clay-700 hover:bg-clay-100',
}
const SIZES = { sm: 'min-h-[36px] px-3 text-[13px] rounded-lg gap-1.5', md: 'min-h-[44px] px-4 text-[14px] rounded-xl gap-2', lg: 'min-h-[52px] px-5 text-[15px] rounded-xl gap-2' }

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', to, href, icon: Icon, iconRight: IconRight, className, children, loading, ...rest }, ref) {
  const cls = cx('inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', BTN[variant], SIZES[size], className)
  const content = (
    <>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : Icon && <Icon size={size === 'sm' ? 15 : 17} aria-hidden />}
      {t(children)}
      {IconRight && <IconRight size={16} aria-hidden />}
    </>
  )
  if (to) return <Link ref={ref} to={to} className={cls} {...rest}>{content}</Link>
  if (href) return <a ref={ref} href={href} className={cls} {...rest}>{content}</a>
  return <button ref={ref} type="button" className={cls} disabled={loading || rest.disabled} {...rest}>{content}</button>
})

export function IconButton({ icon: Icon, label, className, badge, ...rest }) {
  return (
    <button type="button" aria-label={t(label)} title={t(label)} className={cx('relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-forest transition hover:bg-sage-100 active:bg-sage-200', className)} {...rest}>
      <Icon size={20} aria-hidden />
      {badge ? <span className="absolute end-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-white">{badge}</span> : null}
    </button>
  )
}

// ---------- Cards ----------
export function Card({ className, children, as: As = 'div', ...rest }) {
  return <As className={cx('card', className)} {...rest}>{children}</As>
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-100 text-primary-700"><Icon size={16} aria-hidden /></span>}
        <div className="min-w-0">
          <h3 className="section-title leading-tight">{t(title)}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{t(subtitle)}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function LinkRow({ to, children, className }) {
  return (
    <Link to={to} className={cx('group flex min-h-[52px] items-center gap-3 px-4 py-3 transition hover:bg-ivory-50 sm:px-5', className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight size={18} className="shrink-0 text-ink-muted/60 transition group-hover:translate-x-0.5 group-hover:text-primary-600" aria-hidden />
    </Link>
  )
}

// ---------- Avatar ----------
const AV_TONES = ['bg-primary-100 text-primary-800', 'bg-gold-100 text-gold-700', 'bg-sage-200 text-primary-800', 'bg-slateblue-100 text-slateblue-600', 'bg-clay-100 text-clay-700']
export function Avatar({ name = '', size = 40, className }) {
  const tone = AV_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_TONES.length]
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold', tone, className)} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials(name)}
    </span>
  )
}

// ---------- Form fields ----------
export function Field({ label, error, hint, children, required, className, htmlFor }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="label">{t(label)}{required && <span className="text-clay-500"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-[12.5px] font-medium text-clay-600" role="alert">{t(error)}</p> : hint ? <p className="mt-1 text-[12.5px] text-ink-muted">{t(hint)}</p> : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ label, error, hint, required, className, id, ...rest }, ref) {
  const auto = useId()
  const fid = id || auto
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={fid}>
      <input ref={ref} id={fid} className={cx('field', error && 'field-error')} aria-invalid={!!error} {...rest} />
    </Field>
  )
})

export function Select({ label, error, hint, required, className, options, id, placeholder, ...rest }) {
  const auto = useId()
  const fid = id || auto
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={fid}>
      <select id={fid} className={cx('field appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pe-9', error && 'field-error')} aria-invalid={!!error}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B726C' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
        {placeholder && <option value="">{t(placeholder)}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{t(o)}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{t(o.label)}</option>))}
      </select>
    </Field>
  )
}

export function Textarea({ label, error, hint, required, className, id, ...rest }) {
  const auto = useId()
  const fid = id || auto
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={fid}>
      <textarea id={fid} className={cx('field min-h-[88px] resize-y', error && 'field-error')} aria-invalid={!!error} {...rest} />
    </Field>
  )
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }) {
  return (
    <label className={cx('relative block', className)}>
      <span className="sr-only">{t(placeholder)}</span>
      <Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t(placeholder)} className="field ps-10" />
    </label>
  )
}

// Segmented / pill choice group (radio semantics)
export function Segmented({ value, onChange, options, label, size = 'md', className, tone }) {
  return (
    <div role="radiogroup" aria-label={t(label)} className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cx('inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition',
              size === 'sm' ? 'min-h-[36px] px-3 text-[13px]' : 'min-h-[44px] px-3.5 text-[14px]',
              active ? (o.activeClass || tone || 'border-primary-700 bg-primary-700 text-white') : 'border-line-strong bg-white text-ink-soft hover:border-primary-300')}>
            {o.icon && <o.icon size={15} aria-hidden />}
            {t(o.label)}
          </button>
        )
      })}
    </div>
  )
}

export function Rating({ value, onChange, labels, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-5 gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} title={t(labels?.[n]?.label)}
          className={cx('flex min-h-[48px] flex-col items-center justify-center rounded-xl border text-[13px] font-bold transition',
            value === n ? 'border-gold-500 bg-gold-50 text-gold-700 ring-2 ring-gold-200' : value && n < value ? 'border-gold-200 bg-gold-50/40 text-gold-600' : 'border-line-strong bg-white text-ink-muted hover:border-gold-300')}>
          {n}
          <span className="mt-0.5 hidden text-[10px] font-semibold leading-none xs:block">{t(labels?.[n]?.short)}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- Tabs ----------
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="inline-flex min-w-full gap-1 rounded-2xl bg-sage-100/70 p-1 sm:min-w-0">
        {tabs.map((t) => {
          const active = t.value === value
          return (
            <button key={t.value} role="tab" aria-selected={active} type="button" onClick={() => onChange(t.value)}
              className={cx('relative flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition', active ? 'text-forest' : 'text-ink-muted hover:text-forest')}>
              {active && <motion.span layoutId={`tab-${tabs.map((x) => x.value).join('')}`} className="absolute inset-0 rounded-xl bg-white shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <span className="relative flex items-center gap-1.5">{t.icon && <t.icon size={15} aria-hidden />}{tr(t.label)}{t.count != null && <span className="rounded-full bg-sage-200 px-1.5 text-[11px]">{t.count}</span>}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Progress ----------
export function ProgressBar({ value = 0, tone = 'green', className, label, height = 8 }) {
  const reduce = useReducedMotion()
  const c = { green: 'bg-primary-600', gold: 'bg-gold-500', amber: 'bg-amber-500', red: 'bg-clay-500', blue: 'bg-slateblue-500' }[tone]
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-sage-100', className)} style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className={cx('h-full rounded-full', c)} initial={{ width: reduce ? `${value}%` : 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  )
}

export function ProgressRing({ value = 0, size = 72, stroke = 7, tone = '#155C46', children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label || `${value}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E8EFE8" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * Math.min(100, value)) / 100 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

// ---------- Feedback ----------
export function EmptyState({ icon: Icon = Inbox, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="relative mb-3 flex h-14 w-14 items-center justify-center">
        <StarMotif className="absolute inset-0 text-gold-300" />
        <Icon size={22} className="relative text-primary-600" aria-hidden />
      </div>
      <p className="font-bold text-forest">{t(title)}</p>
      {children && <p className="mt-1 max-w-sm text-[13.5px] text-ink-muted">{t(children)}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'gold', icon: Icon, children, className }) {
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="min-w-0">{t(children)}</div>
    </div>
  )
}

// ---------- Modal / bottom sheet ----------
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('lenis-stopped')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('lenis-stopped')
    }
  }, [open, onClose])
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size]
  // Rendered into <body>: an animated page wrapper (will-change: transform) would otherwise
  // become the containing block of this fixed overlay and push it off-screen on long pages.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={t(title)}>
          <motion.div className="absolute inset-0 bg-forest/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={cx('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-3xl', width)}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-3 sm:pt-5">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold">{t(title)}</h2>
                {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{t(subtitle)}</p>}
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} className="-me-2 -mt-1" />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-lenis-prevent>{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-ivory-50 px-5 py-3 pb-safe">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button variant={tone} onClick={() => { onConfirm(); onClose() }}>{t(confirmLabel)}</Button></>}>
      <div className="text-[14px] text-ink-soft">{t(children)}</div>
    </Modal>
  )
}

// ---------- Page header ----------
export function PageHeader({ title, subtitle, actions, crumbs, eyebrow }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-[12.5px] text-ink-muted">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={13} aria-hidden />}
                {c.to ? <Link to={c.to} className="font-semibold hover:text-primary-700">{t(c.label)}</Link> : <span>{t(c.label)}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.12em] text-gold-600">{t(eyebrow)}</p>}
        <h1 className="text-[22px] font-extrabold leading-tight sm:text-[26px]">{t(title)}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-muted">{t(subtitle)}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

// ---------- KPI tile ----------
export function Stat({ label, value, sub, icon: Icon, tone = 'green', to, trend }) {
  const ic = { green: 'bg-primary-50 text-primary-700', gold: 'bg-gold-50 text-gold-700', red: 'bg-clay-50 text-clay-600', amber: 'bg-amber-50 text-amber-700', blue: 'bg-slateblue-50 text-slateblue-600' }[tone]
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold leading-tight text-ink-muted">{t(label)}</p>
        {Icon && <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ic)}><Icon size={16} aria-hidden /></span>}
      </div>
      <p className="mt-1.5 text-[22px] font-extrabold leading-none text-forest tabular sm:text-[24px]">{value}</p>
      {(sub || trend) && <p className="mt-1.5 truncate text-[12px] text-ink-muted">{trend}{t(sub)}</p>}
    </>
  )
  const cls = 'card block p-3.5 sm:p-4 transition'
  return to ? <Link to={to} className={cx(cls, 'hover:-translate-y-0.5 hover:shadow-lift')}>{body}</Link> : <div className={cls}>{body}</div>
}

// ---------- Motion helpers ----------
export function FadeIn({ children, delay = 0, className }) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
      {children}
    </motion.div>
  )
}
export const staggerItem = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } }

// ---------- Islamic motifs ----------
export function StarMotif({ className, strokeWidth = 1.4 }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" aria-hidden>
      <rect x="11" y="11" width="26" height="26" />
      <rect x="11" y="11" width="26" height="26" transform="rotate(45 24 24)" />
      <circle cx="24" cy="24" r="6" />
    </svg>
  )
}

// Institution logo. The source image is a round badge on a dark square, so it is
// cropped to a circle; replace /brand/al-farooquia-logo.jpg to rebrand.
export const LOGO_SRC = '/brand/al-farooquia-logo.jpg'
export function Logo({ size = 40, className }) {
  return (
    <span className={cx('inline-block shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-black/5', className)} style={{ width: size, height: size }}>
      <img src={LOGO_SRC} alt="" width={size} height={size} className="h-full w-full scale-[1.03] object-cover" draggable={false} />
    </span>
  )
}

// Pointed (Mughal-style) arch outline, drawn as a decorative frame.
export function ArchOutline({ className }) {
  return (
    <svg viewBox="0 0 200 260" className={className} fill="none" preserveAspectRatio="none" aria-hidden>
      <path d="M8 258V108C8 60 52 30 100 6c48 24 92 54 92 102v150" stroke="currentColor" strokeWidth="1.5" />
      <path d="M22 258V112c0-40 38-66 78-88 40 22 78 48 78 88v146" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.6" />
    </svg>
  )
}

export function Collapse({ open, children }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  return { open, onOpen: () => setOpen(true), onClose: () => setOpen(false), toggle: () => setOpen((o) => !o), setOpen }
}
