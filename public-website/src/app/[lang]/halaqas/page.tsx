import type { Metadata } from 'next'
import { HalaqaCard, PageHead, Section } from '../../../components/chrome'
import { getHalaqas } from '../../../lib/api'
import { dict, href, isLang, type Lang } from '../../../lib/i18n'

type Props = { params: Promise<{ lang: string }> }
const PATH = '/halaqas'
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isLang(lang) ? lang : 'en').halaqas, alternates: { canonical: href(isLang(lang) ? lang : 'en', PATH), languages: { en: PATH, ar: href('ar', PATH) } } }
}

export default async function Halaqas({ params }: Props) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const items = await getHalaqas()
  return (
    <>
      <PageHead title={t.halaqas} />
      <Section>{items.length ? <div className="grid">{items.map((h) => <HalaqaCard key={h.id} h={h} lang={lang} />)}</div> : <p className="empty">{t.nothing}</p>}</Section>
    </>
  )
}
