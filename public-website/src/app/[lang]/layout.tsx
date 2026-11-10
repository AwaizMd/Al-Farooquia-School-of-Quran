import type { Metadata } from 'next'
import { Amiri, Noto_Naskh_Arabic, Source_Sans_3, Source_Serif_4 } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSite } from '../../lib/api'
import { dict, dirOf, isLang, type Lang } from '../../lib/i18n'
import { jsonLd } from '../../lib/content'
import { Footer, Header } from '../../components/chrome'
import './site.css'

const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif', display: 'swap' })
const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const arabicSerif = Amiri({ subsets: ['arabic'], weight: ['400', '700'], variable: '--font-arabic-serif', display: 'swap' })
const arabicSans = Noto_Naskh_Arabic({ subsets: ['arabic'], variable: '--font-arabic-sans', display: 'swap' })

const hex = (c: string | undefined, fallback: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback)

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const site = await getSite()
  if (!site) return { title: 'Not found', robots: { index: false } }
  const name = lang === 'ar' && site.nameAr ? site.nameAr : site.name
  return {
    metadataBase: new URL(`https://${site.canonicalHost ?? 'localhost'}`),
    title: { default: name, template: `%s | ${name}` },
    description: site.tagline || undefined,
    openGraph: { siteName: name, type: 'website', locale: lang === 'ar' ? 'ar' : 'en', ...(site.logo ? { images: [site.logo] } : {}) },
    ...(site.logo ? { icons: { icon: site.logo } } : {}),
  }
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params
  if (!isLang(raw)) notFound()
  const lang: Lang = raw
  const site = await getSite()
  const fonts = `${serif.variable} ${sans.variable} ${arabicSerif.variable} ${arabicSans.variable}`
  // An address no madrasa has claimed, or a switched-off website: say nothing about anyone.
  if (!site || !site.languages.includes(lang)) {
    return <html lang={lang} dir={dirOf(lang)} className={fonts}><body><main className="narrow section"><h1>{dict(lang).notFound}</h1></main></body></html>
  }
  const primary = hex(site.colors.primary, '#155C46')
  const accent = hex(site.colors.accent, '#B8893B')
  const name = lang === 'ar' && site.nameAr ? site.nameAr : site.name
  const org = { '@context': 'https://schema.org', '@type': 'EducationalOrganization', name, ...(site.canonicalHost ? { url: `https://${site.canonicalHost}` } : {}), ...(site.tagline ? { description: site.tagline } : {}), ...(site.contact.phone ? { telephone: site.contact.phone } : {}), ...(site.contact.email ? { email: site.contact.email } : {}), ...(site.contact.address ? { address: site.contact.address } : {}) }
  return (
    <html lang={lang} dir={dirOf(lang)} className={fonts}>
      <head>
        <style>{`:root{--primary:${primary};--accent:${accent};--accent-ink:color-mix(in srgb,${accent} 62%,#1d2a26)}`}</style>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(org) }} />
      </head>
      <body>
        <a className="skip" href="#main">{dict(lang).skip}</a>
        <Header site={site} lang={lang} />
        <main id="main">{children}</main>
        <Footer site={site} lang={lang} />
      </body>
    </html>
  )
}
