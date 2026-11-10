import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getSite, hostOf } from '../lib/api'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite()
  const host = site?.canonicalHost ?? hostOf(await headers())
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/application/', '/ar/application/', '/preview/', '/ar/preview/'] }, sitemap: `https://${host}/sitemap.xml` }
}
