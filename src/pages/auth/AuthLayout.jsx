import { t } from "../../i18n/I18nProvider"
import { motion } from 'framer-motion'
import { useStore } from '../../context/DemoStore'
import LanguageToggle from "../../components/layout/LanguageToggle"
import { Logo, StarMotif, ArchOutline } from '../../components/ui'

// Shared frame for sign-in, password, invitation and two-step verification screens.
export default function AuthLayout({ title, subtitle, children }) {
  const { state } = useStore()
  return (
    <div className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative overflow-hidden bg-primary-800 text-ivory lg:min-h-dvh">
        <div className="pattern-stars-light absolute inset-0 opacity-70" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900/10 via-transparent to-primary-900/60" aria-hidden />
        <div className="relative mx-auto flex max-w-xl flex-col px-6 pb-16 pt-8 sm:px-10 lg:h-full lg:justify-between lg:py-12">
          <div className="flex items-center gap-3">
            <Logo size={52} />
            <div>
              <p className="text-[17px] font-extrabold tracking-tight text-white">{state.settings.brandName}</p>
              <p className="text-[12.5px] text-gold-200/90">{t(state.settings.tagline)}</p>
            </div>
            <LanguageToggle className="ms-auto !border-white/20 !bg-white/10 [&_button:not([aria-checked=true])]:text-white" />
          </div>

          <div className="relative mt-8 lg:mt-0">
            <div className="relative mx-auto hidden h-[300px] w-[240px] lg:block">
              <ArchOutline className="absolute inset-0 h-full w-full text-gold-300/70" />
              <div className="absolute inset-x-8 bottom-0 top-16 flex flex-col items-center justify-center text-center">
                <Logo size={104} className="mb-3 ring-4 ring-gold-300/40" />
                <p lang="ur" dir="rtl" className="font-urdu-display text-[20px] leading-[2] text-gold-100" style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}>{state.settings.brandArabic}</p>
              </div>
            </div>
            <p lang="ar" dir="rtl" className="text-[22px] leading-[1.8] text-gold-100 lg:hidden">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
            <h1 className="mt-4 text-[26px] font-extrabold leading-tight !text-white sm:text-[32px] lg:mt-10">
              {t("Every student's Sabaq, attendance and progress — in one trusted place.")}
            </h1>
            <p className="mt-3 max-w-md text-[14.5px] text-sage-200">
              {t("Madarsa management for administrators, mentors, students and parents.")}
            </p>
          </div>

          <ul className="mt-8 hidden gap-3 text-[13px] text-sage-200 sm:grid sm:grid-cols-3 lg:mt-0">
            {['Operational control', 'Learning visibility', 'Parent communication'].map((x) => (
              <li key={x} className="flex items-center gap-2"><StarMotif className="h-4 w-4 shrink-0 text-gold-300" />{t(x)}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative -mt-8 rounded-t-[28px] bg-ivory px-5 pb-10 pt-7 sm:px-10 lg:mt-0 lg:flex lg:items-center lg:rounded-none">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto w-full max-w-md">
          {title && <h2 className="text-[24px] font-extrabold">{t(title)}</h2>}
          {subtitle && <p className="mt-1 text-[14px] text-ink-muted">{t(subtitle)}</p>}
          <div className="mt-5">{children}</div>
        </motion.div>
      </section>
    </div>
  )
}

export function FormError({ error }) {
  if (!error) return null
  return <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] font-medium text-clay-700" role="alert">{t(error)}</p>
}

/** Six-digit authenticator code input with the right mobile keyboard and autofill hint. */
export function CodeInput({ label = 'Authenticator code', value, onChange, error, autoFocus = true, recovery = false }) {
  return (
    <div>
      <label htmlFor="otp" className="label">{t(label)}</label>
      <input id="otp" value={value} onChange={(e) => onChange(recovery ? e.target.value.toUpperCase().slice(0, 16) : e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode={recovery ? 'text' : 'numeric'} autoComplete={recovery ? 'off' : 'one-time-code'} autoFocus={autoFocus} spellCheck={false}
        placeholder={recovery ? 'XXXXX-XXXXX' : '123456'} aria-invalid={!!error}
        className={`field text-center font-mono text-[22px] tracking-[0.35em] ${error ? 'field-error' : ''}`} />
    </div>
  )
}
