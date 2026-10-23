import { useI18n, LANGUAGES } from '../../i18n/I18nProvider'
import { cx } from '../ui'

// English ⇄ Urdu switch. Urdu also flips the layout to right-to-left.
export default function LanguageToggle({ className, full }) {
  const { lang, setLang } = useI18n()
  return (
    <div role="radiogroup" aria-label="Language / زبان" className={cx('inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-white p-0.5', className)}>
      {Object.entries(LANGUAGES).map(([code, l]) => (
        <button key={code} type="button" role="radio" aria-checked={lang === code} onClick={() => setLang(code)} lang={code}
          className={cx('min-h-[30px] rounded-full px-2.5 text-[12.5px] font-bold transition', full && 'min-h-[38px] flex-1 px-4 text-[14px]',
            lang === code ? 'bg-primary-700 text-white' : 'text-ink-soft hover:bg-sage-100', code === 'ur' && 'font-arabic')}>
          {full ? l.label : l.short}
        </button>
      ))}
    </div>
  )
}
