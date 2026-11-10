import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHead, Paragraphs, Section } from '../../../components/chrome'
import { getItems, getPage, getSite } from '../../../lib/api'
import { field, list, text } from '../../../lib/content'
import { dict, href, isLang, type Lang } from '../../../lib/i18n'

type Props = { params: Promise<{ lang: string }> }
const PATH = '/admissions'
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isLang(lang) ? lang : 'en').admissions, alternates: { canonical: href(isLang(lang) ? lang : 'en', PATH), languages: { en: PATH, ar: href('ar', PATH) } } }
}

export default async function Admissions({ params }: Props) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const [site, page, programs, faqs] = await Promise.all([getSite(), getPage('admissions'), getItems('PROGRAM'), getItems('FAQ')])
  const steps = list(page, lang, 'process')
  const documents = list(page, lang, 'documents')
  const dates = list(page, lang, 'dates')
  const open = site?.forms.ADMISSION?.enabled
  return (
    <>
      <PageHead title={text(page, lang, 'title') ?? t.admissions} intro={text(page, lang, 'summary')} />
      {!page && !open && !programs.length && !faqs.length && <Section><p className="empty">{t.nothing}</p></Section>}
      {text(page, lang, 'body') && <Section><Paragraphs lead>{text(page, lang, 'body')}</Paragraphs></Section>}
      {steps.length > 0 && <Section title={t.process}><ol className="steps">{steps.map((s) => <li key={s}>{s}</li>)}</ol></Section>}
      {(field(page, lang, 'eligibility') || documents.length > 0 || dates.length > 0) && (
        <Section tint><div className="columns">
          {field(page, lang, 'eligibility') && <div><h2 style={{ marginBottom: 14 }}>{t.eligibility}</h2><Paragraphs>{field(page, lang, 'eligibility')}</Paragraphs></div>}
          {documents.length > 0 && <div><h2 style={{ marginBottom: 14 }}>{t.requiredDocuments}</h2><ul className="ticks">{documents.map((d) => <li key={d}>{d}</li>)}</ul></div>}
          {dates.length > 0 && <div><h2 style={{ marginBottom: 14 }}>{t.importantDates}</h2><ul className="ticks">{dates.map((d) => <li key={d}>{d}</li>)}</ul></div>}
        </div></Section>
      )}
      {programs.length > 0 && <Section title={t.availablePrograms}><ul className="ticks">{programs.map((p) => <li key={p.id}><Link href={href(lang, `/programs/${p.slug}`)}>{text(p, lang, 'title')}</Link></li>)}</ul></Section>}
      {faqs.length > 0 && <Section title={t.faq} tint><div className="faq">{faqs.map((f) => <details key={f.id}><summary>{text(f, lang, 'title')}</summary><Paragraphs>{text(f, lang, 'body')}</Paragraphs></details>)}</div></Section>}
      {open && <section className="band lattice"><div className="wrap"><h2>{t.apply}</h2><div className="actions"><Link className="btn btn-on-dark" href={href(lang, '/register/admission')}>{t.applyNow}</Link></div></div></section>}
    </>
  )
}
