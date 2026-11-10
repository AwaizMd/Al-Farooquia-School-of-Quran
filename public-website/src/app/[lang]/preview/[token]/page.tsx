import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHead, Paragraphs, Section } from '../../../../components/chrome'
import { getPreview } from '../../../../lib/api'
import { text } from '../../../../lib/content'
import { dict, isLang, type Lang } from '../../../../lib/i18n'

export const metadata: Metadata = { title: 'Preview', robots: { index: false, follow: false } }
export default async function Preview({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { lang: raw, token } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const item = await getPreview(token)
  if (!item) notFound()
  return (
    <>
      <p className="preview-bar">{dict(lang).previewBanner}</p>
      <PageHead title={text(item, lang, 'title')!} intro={text(item, lang, 'summary')} />
      <Section>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.image && <img className="article-img" src={item.image} alt="" />}
        <Paragraphs>{text(item, lang, 'body')}</Paragraphs>
      </Section>
    </>
  )
}
