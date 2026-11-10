import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHead, Paragraphs, Section, clock } from '../../../../components/chrome'
import { getItem, getSite } from '../../../../lib/api'
import { field, fmtDate, jsonLd, text } from '../../../../lib/content'
import { dict, href, isLang, type Lang } from '../../../../lib/i18n'
void clock; void Link; void getSite; void jsonLd; void fmtDate; void field

type Props = { params: Promise<{ lang: string; slug: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const l: Lang = isLang(lang) ? lang : 'en'
  const item = await getItem('EVENT', slug)
  if (!item) return { title: dict(l).notFound, robots: { index: false } }
  const path = `/events/${slug}`
  return { title: text(item, l, 'title'), description: text(item, l, 'summary'), alternates: { canonical: href(l, path), languages: { en: path, ar: href('ar', path) } }, openGraph: { title: text(item, l, 'title'), description: text(item, l, 'summary'), ...(item.image ? { images: [item.image] } : {}) } }
}

export default async function Detail({ params }: Props) {
  const { lang: raw, slug } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  void t
  const item = await getItem('EVENT', slug)
  if (!item) notFound()
  const site = await getSite()
  const ld = { '@context': 'https://schema.org', '@type': 'Event', name: item.title, ...(item.summary ? { description: item.summary } : {}), ...(typeof item.data.date === 'string' ? { startDate: item.data.date } : {}), ...(typeof item.data.venue === 'string' ? { location: { '@type': 'Place', name: item.data.venue } } : {}), ...(site ? { organizer: { '@type': 'EducationalOrganization', name: site.name } } : {}) }
  return (
    <>
      <PageHead title={text(item, lang, 'title')!} intro={text(item, lang, 'summary')} />
      <Section>
        <div className="narrow" style={{ paddingInline: 0, marginInline: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.image && <img className="article-img" src={item.image} alt="" />}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
          <dl className="facts">
            {field(item, lang, 'date') && <><dt>{t.date}</dt><dd>{fmtDate(field(item, lang, 'date'), lang)}</dd></>}
            {clock(field(item, lang, 'startTime'), field(item, lang, 'endTime')) && <><dt>{t.time}</dt><dd>{clock(field(item, lang, 'startTime'), field(item, lang, 'endTime'))}</dd></>}
            {field(item, lang, 'venue') && <><dt>{t.venue}</dt><dd>{field(item, lang, 'venue')}</dd></>}
            {field(item, lang, 'contactInfo') && <><dt>{t.contactInfo}</dt><dd>{field(item, lang, 'contactInfo')}</dd></>}
          </dl>
          {field(item, lang, 'registration') && <><h2 style={{ fontSize: '1.3rem', marginBlock: '26px 8px' }}>{t.howToRegister}</h2><Paragraphs>{field(item, lang, 'registration')}</Paragraphs></>}
          {site?.forms.EVENT?.enabled && item.data.registrationOpen === true && <p style={{ marginTop: 22 }}><Link className="btn" href={href(lang, `/register/event?event=${item.id}`)}>{t.register}</Link></p>}
          <Paragraphs>{text(item, lang, 'body')}</Paragraphs>
        </div>
      </Section>
    </>
  )
}
