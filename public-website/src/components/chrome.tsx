import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Item, PublicHalaqa, Site } from '../lib/api'
import { fmtDate, text } from '../lib/content'
import { dict, href, type Dict, type Lang } from '../lib/i18n'

const nameOf = (site: Site, l: Lang) => (l === 'ar' && site.nameAr ? site.nameAr : site.name)
const NAV: [string, keyof Dict][] = [['/about', 'about'], ['/programs', 'programs'], ['/halaqas', 'halaqas'], ['/admissions', 'admissions'], ['/news', 'news'], ['/events', 'events'], ['/contact', 'contact']]

export function Header({ site, lang }: { site: Site; lang: Lang }) {
  const t = dict(lang)
  const other = lang === 'en' ? 'ar' : 'en'
  const hasOther = site.languages.includes(other)
  const links = NAV.map(([p, k]) => <Link key={p} href={href(lang, p)}>{t[k] as string}</Link>)
  const swap = hasOther ? <Link className="lang" lang={other} href={href(other, '/')}>{t.language}</Link> : null
  return (
    <header className="head">
      <div className="wrap head-row">
        <Link className="brand" href={href(lang, '/')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {site.logo && <img src={site.logo} alt="" width={46} height={46} />}
          <span><span className="brand-name">{nameOf(site, lang)}</span>{site.tagline && <span className="brand-tag">{site.tagline}</span>}</span>
        </Link>
        <nav className="nav" aria-label={t.menu}>{links}{swap}</nav>
        <details className="menu-box"><summary>{t.menu}</summary><nav aria-label={t.menu}>{links}{swap}</nav></details>
      </div>
    </header>
  )
}

export function Footer({ site, lang }: { site: Site; lang: Lang }) {
  const t = dict(lang)
  const c = site.contact
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div><h2>{nameOf(site, lang)}</h2>{site.tagline && <p>{site.tagline}</p>}</div>
          <div><h2>{t.contactUs}</h2><ul>{c.address && <li>{c.address}</li>}{c.phone && <li><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} dir="ltr">{c.phone}</a></li>}{c.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}</ul></div>
          <div><h2>{t.menu}</h2><ul>{NAV.map(([p, k]) => <li key={p}><Link href={href(lang, p)}>{t[k] as string}</Link></li>)}</ul></div>
        </div>
        <div className="foot-base"><span>© {new Date().getFullYear()} {nameOf(site, lang)}. {t.rights}</span>{site.privacyNotice && <Link href={href(lang, '/privacy')}>{t.privacy}</Link>}</div>
      </div>
    </footer>
  )
}

export const PageHead = ({ eyebrow, title, intro }: { eyebrow?: string | undefined; title: string; intro?: string | undefined }) => (
  <header className="page-head"><div className="wrap">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{intro && <p>{intro}</p>}</div></header>
)

/** Content is plain text from the CMS: React escapes it, and blank lines make paragraphs. */
export const Paragraphs = ({ children, lead }: { children?: string | undefined; lead?: boolean }) => (children ? <div className={lead ? 'prose prose-lead' : 'prose'}>{children.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div> : null)

export const Section = ({ title, action, tint, children }: { title?: string | undefined; action?: ReactNode; tint?: boolean; children: ReactNode }) => (
  <section className={`section${tint ? ' section-tint' : ''}`}><div className="wrap">{(title || action) && <div className="section-head">{title && <h2>{title}</h2>}{action}</div>}{children}</div></section>
)

export const clock = (a?: string | null, b?: string | null) => [a, b].filter(Boolean).join(' – ')

export function schedule(h: PublicHalaqa, t: Dict) {
  const days = h.meetingDays.map((d) => t.days[d]).filter(Boolean).join(', ')
  const freq = { WEEKLY: t.weekly, MONTHLY: t.monthly, ONE_OFF: t.oneOff, CUSTOM: t.custom }[h.frequency] ?? ''
  return [days || freq, clock(h.startTime, h.endTime)].filter(Boolean).join(' · ')
}

export function HalaqaCard({ h, lang }: { h: PublicHalaqa; lang: Lang }) {
  const t = dict(lang)
  const when = schedule(h, t)
  return (
    <article className="card">
      <span className="tag">{h.category}</span>
      <h3>{h.name}</h3>
      {h.description && <p style={{ marginTop: 10 }}>{h.description}</p>}
      <dl className="facts">
        {when && <><dt>{t.schedule}</dt><dd>{when}</dd></>}
        {h.location && <><dt>{t.location}</dt><dd>{h.location}</dd></>}
        {h.eligibility && <><dt>{t.eligibility}</dt><dd>{h.eligibility}</dd></>}
      </dl>
      <p className="more">{h.registrationOpen ? <Link href={href(lang, `/register/halaqa?halaqa=${h.id}`)}>{t.register}</Link> : t.registrationClosed}</p>
    </article>
  )
}

export function ItemCard({ item, base, lang, showDate }: { item: Item; base: string; lang: Lang; showDate?: boolean }) {
  const t = dict(lang)
  const eventDate = typeof item.data.date === 'string' ? item.data.date : null
  const date = eventDate ?? (showDate ? item.publishedAt : null)
  return (
    <article className="card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.image && <img className="card-img" src={item.image} alt="" loading="lazy" />}
      {date && <p className="meta">{fmtDate(date, lang)}</p>}
      <h3><Link href={href(lang, `${base}/${item.slug}`)}>{text(item, lang, 'title')}</Link></h3>
      {text(item, lang, 'summary') && <p style={{ marginTop: 10 }}>{text(item, lang, 'summary')}</p>}
      <p className="more"><Link href={href(lang, `${base}/${item.slug}`)}>{t.readMore}</Link></p>
    </article>
  )
}
