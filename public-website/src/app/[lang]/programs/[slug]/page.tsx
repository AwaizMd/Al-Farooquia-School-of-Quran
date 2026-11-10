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
  const item = await getItem('PROGRAM', slug)
  if (!item) return { title: dict(l).notFound, robots: { index: false } }
  const path = `/programs/${slug}`
  return { title: text(item, l, 'title'), description: text(item, l, 'summary'), alternates: { canonical: href(l, path), languages: { en: path, ar: href('ar', path) } }, openGraph: { title: text(item, l, 'title'), description: text(item, l, 'summary'), ...(item.image ? { images: [item.image] } : {}) } }
}

export default async function Detail({ params }: Props) {
  const { lang: raw, slug } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  void t
  const item = await getItem('PROGRAM', slug)
  if (!item) notFound()
  const site = await getSite()
  return (
    <>
      <PageHead title={text(item, lang, 'title')!} intro={text(item, lang, 'summary')} />
      <Section>
        <div className="narrow" style={{ paddingInline: 0, marginInline: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.image && <img className="article-img" src={item.image} alt="" />}
          <dl className="facts">
            {field(item, lang, 'eligibility') && <><dt>{t.eligibility}</dt><dd>{field(item, lang, 'eligibility')}</dd></>}
            {field(item, lang, 'duration') && <><dt>{t.duration}</dt><dd>{field(item, lang, 'duration')}</dd></>}
            {field(item, lang, 'timings') && <><dt>{t.timings}</dt><dd>{field(item, lang, 'timings')}</dd></>}
            {site?.showSeats && field(item, lang, 'seats') && <><dt>{t.seats}</dt><dd>{field(item, lang, 'seats')}</dd></>}
          </dl>
          {field(item, lang, 'registration') && <><h2 style={{ fontSize: '1.3rem', marginBlock: '26px 8px' }}>{t.howToRegister}</h2><Paragraphs>{field(item, lang, 'registration')}</Paragraphs></>}
          {site?.forms.ADMISSION?.enabled && <p style={{ marginTop: 22 }}><Link className="btn" href={href(lang, `/register/admission?program=${item.id}`)}>{t.applyNow}</Link></p>}
          <Paragraphs>{text(item, lang, 'body')}</Paragraphs>
        </div>
      </Section>
    </>
  )
}
