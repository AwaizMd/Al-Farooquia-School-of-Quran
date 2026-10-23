import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import UR from './ur'
import { SURAHS } from '../data/quran'
import { setDateLocale } from '../utils/date'

// English strings are the keys; Urdu falls back to English when a key is missing,
// so untranslated text never disappears. `{name}` placeholders are filled from `vars`.
export const LANGUAGES = {
  en: { label: 'English', short: 'EN', dir: 'ltr', dateLocale: 'en-GB' },
  ur: { label: 'اردو', short: 'اردو', dir: 'rtl', dateLocale: 'ur-IN-u-nu-latn' },
}
const LANG_KEY = 'farooquia-lang'

const I18nContext = createContext(null)

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : s)

// Surah transliterations → Arabic names, longest first so "Al-Baqarah" wins over shorter matches.
const SURAH_MAP = SURAHS.map((s) => [s.name, s.arabic]).sort((a, b) => b[0].length - a[0].length)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SURAH_RE = new RegExp(`\\b(${SURAH_MAP.map(([n]) => escapeRe(n)).join('|')})\\b`, 'g')
const SURAH_LOOKUP = Object.fromEntries(SURAH_MAP)

// Fallback for strings built from data (targets, ranges): localise the known
// learning phrases and show Surah names in Arabic script.
function localiseLearning(s) {
  return s
    .replace(/^Repeat: /, 'دوبارہ: ')
    .replace(/^Repeat Qaida Lesson (\d+)/, 'قاعدہ سبق $1 دوبارہ')
    .replace(/^Qaida Lesson (\d+)/, 'قاعدہ سبق $1')
    .replace(/^Qaida · Lesson (\d+)/, 'قاعدہ · سبق $1')
    .replace(/^Manzil: /, 'منزل: ')
    // Only strings with verse numbers are portions; names like "Maryam Khan" stay untouched.
    .replace(SURAH_RE, (m) => (/\d/.test(s) ? SURAH_LOOKUP[m] || m : m))
}

export function translate(lang, s, vars) {
  if (typeof s !== 'string') return s
  if (lang !== 'ur') return fill(s, vars)
  const hit = UR[s]
  // Isolate number ranges (e.g. 149–154) so right-to-left text doesn't reverse them.
  return fill(hit ?? localiseLearning(s), vars).replace(/(\d+\s?[–-]\s?\d+)/g, '⁦$1⁩')
}

// The institution name to use inside sentences: the Urdu name in Urdu mode.
export const brandName = (settings) => (current === 'ur' && settings.brandArabic ? settings.brandArabic : settings.brandName)

// Module-level translator. The routed tree remounts when the language changes,
// so components and toasts can call t() directly without a hook.
let current = 'en'
export const t = (s, vars) => translate(current, s, vars)
export const currentLang = () => current

function readLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'ur' ? 'ur' : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readLang)
  // Set synchronously so t() and date helpers use the right language during this render.
  current = lang
  setDateLocale(LANGUAGES[lang].dateLocale, (s, v) => translate(lang, s, v))

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = LANGUAGES[lang].dir
    try { localStorage.setItem(LANG_KEY, lang) } catch { /* storage blocked: language resets on reload */ }
  }, [lang])

  const t = useCallback((s, vars) => translate(lang, s, vars), [lang])
  const setLang = useCallback((l) => setLangState(l === 'ur' ? 'ur' : 'en'), [])
  const value = useMemo(() => ({ lang, setLang, t, dir: LANGUAGES[lang].dir, isRTL: lang === 'ur' }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
export const useT = () => useContext(I18nContext).t
