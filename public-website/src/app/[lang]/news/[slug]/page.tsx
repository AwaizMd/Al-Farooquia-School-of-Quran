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
  const item = await getItem('ANNOUNCEMENT', slug)
  if (!item) return { title: dict(l).notFound, robots: { index: false } }
  const path = `/news/${slug}`
  return { title: text(item, l, 'title'), description: text(item, l, 'summary'), alternates: { canonical: href(l, path), languages: { en: path, ar: href('ar', path) } }, openGraph: { title: text(item, l, 'title'), description: text(item, l, 'summary'), ...(item.image ? { images: [item.image] } : {}) } }
}

export default async function Detail({ params }: Props) {
  const { lang: raw, slug } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  void t
  const item = await getItem('ANNOUNCEMENT', slug)
  if (!item) notFound()
  
  return (
    <>
      <PageHead title={text(item, lang, 'title')!} intro={text(item, lang, 'summary')} />
      <Section>
        <div className="narrow" style={{ paddingInline: 0, marginInline: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.image && <img className="article-img" src={item.image} alt="" />}
          {item.publishedAt && <p className="meta">{t.published} {fmtDate(item.publishedAt, lang)}</p>}
          <Paragraphs>{text(item, lang, 'body')}</Paragraphs>
        </div>
      </Section>
    </>
  )
}
