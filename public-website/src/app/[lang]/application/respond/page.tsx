import type { Metadata } from 'next'
import { PageHead } from '../../../../components/chrome'
import { RespondForm } from '../../../../components/RegistrationForm'
import { dict, isLang, type Lang } from '../../../../lib/i18n'

export const metadata: Metadata = { title: 'Application', robots: { index: false }, referrer: 'no-referrer' }
export default async function Respond({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ token?: string }> }) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const { token } = await searchParams
  return <><PageHead title={t.respondTitle} /><div className="narrow section">{token ? <RespondForm lang={lang} token={token} /> : <p className="alert">{t.linkInvalid}</p>}</div></>
}
