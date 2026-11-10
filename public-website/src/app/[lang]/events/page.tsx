import type { Metadata } from 'next'
import { ItemCard, PageHead, Section } from '../../../components/chrome'
import { getItems } from '../../../lib/api'
import { dict, href, isLang, type Lang } from '../../../lib/i18n'

type Props = { params: Promise<{ lang: string }> }
const PATH = '/events'
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isLang(lang) ? lang : 'en').events, alternates: { canonical: href(isLang(lang) ? lang : 'en', PATH), languages: { en: PATH, ar: href('ar', PATH) } } }
}

export default async function List({ params }: Props) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const items = await getItems('EVENT')
  return (
    <>
      <PageHead title={t.events} />
      <Section>{items.length ? <div className="grid">{items.map((i) => <ItemCard key={i.id} item={i} base="/events" lang={lang} />)}</div> : <p className="empty">{t.nothing}</p>}</Section>
    </>
  )
}
