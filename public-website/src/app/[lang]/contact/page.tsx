import type { Metadata } from 'next'
import { PageHead, Section } from '../../../components/chrome'
import { RegistrationForm } from '../../../components/RegistrationForm'
import { getFormToken, getSite } from '../../../lib/api'
import { dict, href, isLang, type Lang } from '../../../lib/i18n'

type Props = { params: Promise<{ lang: string }> }
const PATH = '/contact'
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isLang(lang) ? lang : 'en').contact, alternates: { canonical: href(isLang(lang) ? lang : 'en', PATH), languages: { en: PATH, ar: href('ar', PATH) } } }
}

export default async function Contact({ params }: Props) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const [site, formToken] = await Promise.all([getSite(), getFormToken()])
  if (!site) return null
  const c = site.contact
  const form = site.forms.ENQUIRY
  return (
    <>
      <PageHead title={t.contactUs} />
      <Section>
        <div className="columns">
          <div>
            <dl className="facts">
              {c.address && <><dt>{t.address}</dt><dd>{c.address}</dd></>}
              {c.phone && <><dt>{t.phone}</dt><dd dir="ltr" style={{ textAlign: 'start' }}><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></dd></>}
              {c.email && <><dt>{t.email}</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></>}
              {c.hours && <><dt>{t.hours}</dt><dd>{c.hours}</dd></>}
            </dl>
            {c.mapUrl && <p><a href={c.mapUrl} rel="noopener noreferrer" target="_blank">{t.map}</a></p>}
            {!c.address && !c.phone && !c.email && <p className="empty">{t.nothing}</p>}
          </div>
          {form?.enabled && <div><h2 style={{ marginBottom: 18 }}>{t.enquire}</h2><RegistrationForm type="ENQUIRY" lang={lang} fields={form.fields} instructions={form.instructions} allowDocuments={false} consentText={site.consentText} formToken={formToken} nameLabel={t.fullName} /></div>}
        </div>
      </Section>
    </>
  )
}
