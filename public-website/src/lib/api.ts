import 'server-only'
import { headers } from 'next/headers'

// The only place the website talks to the MMS API. It runs on the server, holds the site
// token (never sent to a browser), and tells the API which hostname was requested: the API
// uses that, and nothing a visitor sends, to decide which madrasa this is.

const API = (process.env.MMS_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '')
const TOKEN = process.env.PUBLIC_SITE_TOKEN || ''

export const hostOf = (h: Headers) => (h.get('host') || '').toLowerCase().replace(/:\d+$/, '')

// Never cached on this server: unpublishing must take effect at once, not when a cache expires.
export async function apiFetch(path: string, host: string, init: RequestInit & { clientIp?: string } = {}) {
  const { clientIp, ...rest } = init
  return fetch(`${API}/public${path}`, {
    ...rest,
    headers: { ...rest.headers, 'X-Site-Token': TOKEN, 'X-Site-Host': host, ...(clientIp ? { 'X-Client-Ip': clientIp } : {}) },
    cache: 'no-store',
  })
}

async function read<T>(path: string, fallback: T): Promise<T> {
  const host = hostOf(await headers())
  try {
    const r = await apiFetch(path, host)
    return r.ok ? ((await r.json()) as T) : fallback
  } catch {
    return fallback
  }
}

export interface FormField { key: string; label: string; type: 'text' | 'textarea' | 'date' | 'tel' | 'email' | 'select' | 'number'; required: boolean; options?: string[] }
export interface FormConfig { enabled: boolean; instructions: string; allowDocuments: boolean; fields: FormField[] }
export type FormType = 'ADMISSION' | 'HALAQA' | 'MUREED' | 'EVENT' | 'ENQUIRY'
export interface Site {
  name: string; nameAr: string; tagline: string; logo: string | null; colors: { primary: string; accent: string }
  contact: { address: string; phone: string; email: string; mapUrl: string; hours: string }
  languages: ('en' | 'ar')[]; privacyNotice: string; consentText: string; showSeats: boolean; canonicalHost: string | null; forms: Record<FormType, FormConfig>
}
export interface Item {
  id: string; type: string; slug: string; title: string; summary: string | null; body: string | null; data: Record<string, unknown> & { ar?: Record<string, unknown> }
  category: string | null; image: string | null; featured: boolean; publishedAt: string | null; updatedAt: string
}
export interface PublicHalaqa { id: string; name: string; description: string | null; eligibility: string | null; category: string; location: string | null; frequency: string; meetingDays: number[]; startTime: string | null; endTime: string | null; registrationOpen: boolean }

export const getSite = () => read<Site | null>('/site', null)
export const getItems = async (type: 'PAGE' | 'PROGRAM' | 'ANNOUNCEMENT' | 'EVENT' | 'FAQ') => (await read<{ items: Item[] }>(`/items?type=${type}`, { items: [] })).items
export const getItem = (type: string, slug: string) => read<Item | null>(`/items/${type}/${encodeURIComponent(slug)}`, null)
export const getHalaqas = async () => (await read<{ items: PublicHalaqa[] }>('/halaqas', { items: [] })).items
export const getPage = (slug: string) => getItem('PAGE', slug)

/** Fresh every time: it is what proves a form has been open for a while. */
export async function getFormToken() {
  const host = hostOf(await headers())
  const r = await apiFetch('/form-token', host)
  return r.ok ? ((await r.json()) as { token: string }).token : ''
}

export async function getPreview(token: string) {
  const host = hostOf(await headers())
  const r = await apiFetch(`/preview/${encodeURIComponent(token)}`, host)
  return r.ok ? ((await r.json()) as Item) : null
}
