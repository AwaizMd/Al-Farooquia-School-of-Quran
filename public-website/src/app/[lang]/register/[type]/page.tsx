import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHead } from '../../../../components/chrome'
import { RegistrationForm, type Choice } from '../../../../components/RegistrationForm'
import { getFormToken, getHalaqas, getItems, getSite, type FormType } from '../../../../lib/api'
import { text } from '../../../../lib/content'
import { dict, isLang, type Dict, type Lang } from '../../../../lib/i18n'

const TYPES: Record<string, { form: FormType; title: keyof Dict }> = { admission: { form: 'ADMISSION', title: 'regAdmission' }, halaqa: { form: 'HALAQA', title: 'regHalaqa' }, mureed: { form: 'MUREED', title: 'regMureed' }, event: { form: 'EVENT', title: 'regEvent' }, enquiry: { form: 'ENQUIRY', title: 'regEnquiry' } }
type Props = { params: Promise<{ lang: string; type: string }>; searchParams: Promise<Record<string, string | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, type } = await params
  const def = TYPES[type]
  return { title: def ? (dict(isLang(lang) ? lang : 'en')[def.title] as string) : undefined, robots: { index: type === 'admission' || type === 'halaqa' } }
}

export default async function Register({ params, searchParams }: Props) {
  const { lang: raw, type } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const def = TYPES[type]
  if (!def) notFound()
  const q = await searchParams
  const [site, formToken] = await Promise.all([getSite(), getFormToken()])
  const form = site?.forms[def.form]
  if (!site || !form) notFound()
  let choices: Choice[] | undefined
  let choiceLabel = ''
  let chosen: string | undefined
  if (def.form === 'HALAQA') {
    choices = (await getHalaqas()).filter((h) => h.registrationOpen).map((h) => ({ id: h.id, label: h.name }))
    choiceLabel = t.chooseHalaqa; chosen = q.halaqa
  } else if (def.form === 'EVENT') {
    choices = (await getItems('EVENT')).filter((e) => e.data.registrationOpen === true).map((e) => ({ id: e.id, label: text(e, lang, 'title')! }))
    choiceLabel = t.chooseEvent; chosen = q.event
  } else if (def.form === 'ADMISSION') {
    const programs = await getItems('PROGRAM')
    if (programs.length) { choices = programs.map((p) => ({ id: p.id, label: text(p, lang, 'title')! })); choiceLabel = t.chooseProgram; chosen = q.program }
  }
  return (
    <>
      <PageHead title={t[def.title] as string} />
      <div className="narrow section">
        {form.enabled
          ? <RegistrationForm type={def.form} lang={lang} fields={form.fields} instructions={form.instructions} allowDocuments={form.allowDocuments} consentText={site.consentText} formToken={formToken} nameLabel={def.form === 'ADMISSION' ? t.studentName : t.fullName} {...(choices ? { choices, choiceLabel, chosen } : {})} />
          : <p className="empty">{t.closedForm}</p>}
      </div>
    </>
  )
}
