import type { Metadata } from 'next'
import { PageHead, Paragraphs, Section } from '../../../components/chrome'
import { getPage } from '../../../lib/api'
import { field, list, text } from '../../../lib/content'
import { dict, href, isLang, type Lang } from '../../../lib/i18n'

type Props = { params: Promise<{ lang: string }> }
const PATH = '/about'
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isLang(lang) ? lang : 'en').about, alternates: { canonical: href(isLang(lang) ? lang : 'en', PATH), languages: { en: PATH, ar: href('ar', PATH) } } }
}

export default async function About({ params }: Props) {
  const { lang: raw } = await params
  const lang: Lang = isLang(raw) ? raw : 'en'
  const t = dict(lang)
  const page = await getPage('about')
  const achievements = list(page, lang, 'achievements')
  const facilities = list(page, lang, 'facilities')
  const blocks: [string, string | undefined][] = [[t.history, field(page, lang, 'history')], [t.philosophy, field(page, lang, 'philosophy')]]
  return (
    <>
      <PageHead title={text(page, lang, 'title') ?? t.about} intro={text(page, lang, 'summary')} />
      {!page && <Section><p className="empty">{t.nothing}</p></Section>}
      {text(page, lang, 'body') && <Section><Paragraphs lead>{text(page, lang, 'body')}</Paragraphs></Section>}
      {(field(page, lang, 'mission') || field(page, lang, 'vision')) && (
        <Section tint><div className="columns">
          {field(page, lang, 'mission') && <div><hr className="rule" /><h2>{t.mission}</h2><Paragraphs>{field(page, lang, 'mission')}</Paragraphs></div>}
          {field(page, lang, 'vision') && <div><hr className="rule" /><h2>{t.vision}</h2><Paragraphs>{field(page, lang, 'vision')}</Paragraphs></div>}
        </div></Section>
      )}
      {blocks.filter(([, v]) => v).map(([title, v]) => <Section key={title} title={title}><Paragraphs>{v}</Paragraphs></Section>)}
      {field(page, lang, 'principalProfile') && <Section title={field(page, lang, 'principalName') ?? t.principal} tint><Paragraphs>{field(page, lang, 'principalProfile')}</Paragraphs></Section>}
      {(achievements.length > 0 || facilities.length > 0) && (
        <Section><div className="columns">
          {achievements.length > 0 && <div><h2 style={{ marginBottom: 18 }}>{t.achievements}</h2><ul className="ticks">{achievements.map((a) => <li key={a}>{a}</li>)}</ul></div>}
          {facilities.length > 0 && <div><h2 style={{ marginBottom: 18 }}>{t.facilities}</h2><ul className="ticks">{facilities.map((a) => <li key={a}>{a}</li>)}</ul></div>}
        </div></Section>
      )}
    </>
  )
}
