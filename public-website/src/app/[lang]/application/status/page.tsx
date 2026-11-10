import type { Metadata } from 'next'
import { PageHead } from '../../../../components/chrome'
import { StatusForm } from '../../../../components/RegistrationForm'
import { dict, isLang, type Lang } from '../../../../lib/i18n'

export const metadata: Metadata = { title: 'Application status', robots: { index: false } }
export default async function Status({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  return <><PageHead title={dict(lang).statusTitle} /><div className="narrow section"><StatusForm lang={lang} /></div></>
}
