import type { Lang } from './i18n'

// Reading CMS content. Arabic text is optional, item by item: anything not translated
// falls back to English, and nothing is ever machine-translated or invented.
export interface Localisable { title?: string; summary?: string | null; body?: string | null; data?: Record<string, unknown> & { ar?: Record<string, unknown> } }

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export const text = (item: Localisable | null | undefined, l: Lang, key: 'title' | 'summary' | 'body') => {
  if (!item) return undefined
  return (l === 'ar' ? clean(item.data?.ar?.[key]) : undefined) ?? clean(item[key])
}
export const field = (item: Localisable | null | undefined, l: Lang, key: string) => {
  if (!item) return undefined
  return (l === 'ar' ? clean(item.data?.ar?.[key]) : undefined) ?? clean(item.data?.[key])
}
/** A list field is stored as one entry per line, which is what the CMS form edits. */
export const list = (item: Localisable | null | undefined, l: Lang, key: string) => (field(item, l, key) ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

export const fmtDate = (iso: string | null | undefined, l: Lang) => {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(l === 'ar' ? 'ar' : 'en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(d)
}

export const jsonLd = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c')
