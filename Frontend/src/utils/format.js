import { CURRENCIES } from '../constants/config'

export const money = (amount, currencyCode = 'INR') => {
  const c = CURRENCIES[currencyCode] || CURRENCIES.INR
  const n = Math.round(Number(amount) || 0)
  return `${c.symbol}${c.symbol.length > 1 ? ' ' : ''}${n.toLocaleString(c.locale)}`
}

export const compactMoney = (amount, currencyCode = 'INR') => {
  const c = CURRENCIES[currencyCode] || CURRENCIES.INR
  const n = Number(amount) || 0
  if (Math.abs(n) >= 100000) return `${c.symbol}${(n / 1000).toFixed(0)}k`
  if (Math.abs(n) >= 10000) return `${c.symbol}${(n / 1000).toFixed(1)}k`
  return money(n, currencyCode)
}

export const pct = (num, den, digits = 0) => (den ? +((num / den) * 100).toFixed(digits) : 0)

export const initials = (name = '') =>
  name.replace(/^(Qari|Hafiz|Maulana|Mufti|Ustadha|Mr\.|Mrs\.|Dr\.)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const plural = (n, word, pluralWord) => `${n} ${n === 1 ? word : pluralWord || `${word}s`}`
