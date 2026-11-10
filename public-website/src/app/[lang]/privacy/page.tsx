import type { Metadata } from 'next'
import { PageHead, Paragraphs, Section } from '../../../components/chrome'
import { getSite } from '../../../lib/api'
import { dict, isLang, type Lang } from '../../../lib/i18n'

export const metadata: Metadata = { title: 'Privacy notice' }
export default async function Privacy({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const site = await getSite()
  return <><PageHead title={t.privacy} /><Section>{site?.privacyNotice ? <Paragraphs>{site.privacyNotice}</Paragraphs> : <p className="empty">{t.nothing}</p>}</Section></>
}
