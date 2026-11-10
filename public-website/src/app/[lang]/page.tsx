import Link from 'next/link'
import { HalaqaCard, ItemCard, Paragraphs, Section } from '../../components/chrome'
import { getHalaqas, getItems, getPage, getSite } from '../../lib/api'
import { field, text } from '../../lib/content'
import { dict, href, isLang, type Lang } from '../../lib/i18n'

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const [site, page, programs, news, events, halaqas] = await Promise.all([getSite(), getPage('home'), getItems('PROGRAM'), getItems('ANNOUNCEMENT'), getItems('EVENT'), getHalaqas()])
  if (!site) return null
  const name = lang === 'ar' && site.nameAr ? site.nameAr : site.name
  const mission = field(page, lang, 'mission')
  const vision = field(page, lang, 'vision')
  const principal = field(page, lang, 'principalIntro')
  const admissionInfo = field(page, lang, 'admissionInfo')
  const halaqaInfo = field(page, lang, 'halaqaInfo')
  const heading = text(page, lang, 'title') ?? name
  const admissionsOpen = site.forms.ADMISSION?.enabled
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          {heading !== name && <p className="eyebrow">{name}</p>}
          <h1>{heading}</h1>
          <p className="hero-lede">{text(page, lang, 'summary') ?? site.tagline}</p>
          <div className="actions">
            {admissionsOpen && <Link className="btn" href={href(lang, '/register/admission')}>{t.apply}</Link>}
            <Link className="btn btn-ghost" href={href(lang, programs.length ? '/programs' : '/contact')}>{programs.length ? t.ourPrograms : t.contactUs}</Link>
          </div>
        </div>
        <div className="hero-panel lattice" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {page?.image ? <img className="photo" src={page.image} alt="" /> : <div className="arch">{/* eslint-disable-next-line @next/next/no-img-element */}{site.logo ? <img src={site.logo} alt="" /> : <span>{name}</span>}</div>}
        </div>
      </section>

      {(text(page, lang, 'body') || mission || vision) && (
        <Section>
          <Paragraphs lead>{text(page, lang, 'body')}</Paragraphs>
          {(mission || vision) && (
            <div className="columns" style={{ marginTop: text(page, lang, 'body') ? 40 : 0 }}>
              {mission && <div><hr className="rule" /><h2>{t.mission}</h2><Paragraphs>{mission}</Paragraphs></div>}
              {vision && <div><hr className="rule" /><h2>{t.vision}</h2><Paragraphs>{vision}</Paragraphs></div>}
            </div>
          )}
        </Section>
      )}

      {programs.length > 0 && (
        <Section title={t.ourPrograms} tint action={<Link href={href(lang, '/programs')}>{t.allPrograms}</Link>}>
          <div className="grid">{programs.slice(0, 3).map((p) => <ItemCard key={p.id} item={p} base="/programs" lang={lang} />)}</div>
        </Section>
      )}

      {principal && <Section title={t.principal}><Paragraphs>{principal}</Paragraphs></Section>}

      {halaqas.length > 0 && (
        <Section title={t.halaqaIntro} tint action={<Link href={href(lang, '/halaqas')}>{t.allHalaqas}</Link>}>
          {halaqaInfo && <div style={{ marginBottom: 26 }}><Paragraphs>{halaqaInfo}</Paragraphs></div>}
          <div className="grid">{halaqas.slice(0, 3).map((h) => <HalaqaCard key={h.id} h={h} lang={lang} />)}</div>
        </Section>
      )}

      {news.length > 0 && (
        <Section title={t.latestNews} action={<Link href={href(lang, '/news')}>{t.allNews}</Link>}>
          <div className="grid">{news.slice(0, 3).map((n) => <ItemCard key={n.id} item={n} base="/news" lang={lang} showDate />)}</div>
        </Section>
      )}

      {events.length > 0 && (
        <Section title={t.upcoming} tint action={<Link href={href(lang, '/events')}>{t.allEvents}</Link>}>
          <div className="grid">{events.slice(0, 3).map((e) => <ItemCard key={e.id} item={e} base="/events" lang={lang} />)}</div>
        </Section>
      )}

      {(admissionInfo || admissionsOpen) && (
        <section className="band lattice">
          <div className="wrap">
            <h2>{t.admissionOpen}</h2>
            {admissionInfo && <p style={{ marginTop: 14 }}>{admissionInfo}</p>}
            <div className="actions"><Link className="btn btn-on-dark" href={href(lang, '/admissions')}>{t.readMore}</Link></div>
          </div>
        </section>
      )}

      {(site.contact.address || site.contact.phone || site.contact.email) && (
        <Section title={t.visit}>
          <dl className="facts">
            {site.contact.address && <><dt>{t.address}</dt><dd>{site.contact.address}</dd></>}
            {site.contact.phone && <><dt>{t.phone}</dt><dd dir="ltr" style={{ textAlign: 'start' }}><a href={`tel:${site.contact.phone.replace(/[^\d+]/g, '')}`}>{site.contact.phone}</a></dd></>}
            {site.contact.email && <><dt>{t.email}</dt><dd><a href={`mailto:${site.contact.email}`}>{site.contact.email}</a></dd></>}
          </dl>
          <Link className="btn btn-ghost" href={href(lang, '/contact')}>{t.contactUs}</Link>
        </Section>
      )}
    </>
  )
}
