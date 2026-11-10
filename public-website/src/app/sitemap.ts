import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getItems, getSite, hostOf } from '../lib/api'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [h, site] = [await headers(), await getSite()]
  if (!site) return []
  const host = site.canonicalHost ?? hostOf(h)
  const base = `https://${host}`
  const langs = site.languages
  const entry = (path: string, lastModified?: string) => langs.map((l) => ({ url: `${base}${l === 'en' ? '' : '/ar'}${path === '/' && l !== 'en' ? '' : path}`, ...(lastModified ? { lastModified } : {}) }))
  const [programs, news, events] = await Promise.all([getItems('PROGRAM'), getItems('ANNOUNCEMENT'), getItems('EVENT')])
  return [
    ...['/', '/about', '/programs', '/halaqas', '/admissions', '/news', '/events', '/contact'].flatMap((p) => entry(p)),
    ...programs.flatMap((i) => entry(`/programs/${i.slug}`, i.updatedAt)), ...news.flatMap((i) => entry(`/news/${i.slug}`, i.updatedAt)), ...events.flatMap((i) => entry(`/events/${i.slug}`, i.updatedAt)),
  ]
}
