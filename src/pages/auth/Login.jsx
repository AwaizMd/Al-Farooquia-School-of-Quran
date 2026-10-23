import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, UserRound, GraduationCap, Users, ArrowRight, Eye, EyeOff, Info, Lock } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../constants/config'
import LanguageToggle from "../../components/layout/LanguageToggle"
import { Button, Input, Logo, StarMotif, ArchOutline, cx } from '../../components/ui'

const ROLE_ICON = { admin: ShieldCheck, mentor: UserRound, student: GraduationCap, parent: Users }

export default function Login() {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  const enter = (acc) => {
    dispatch({ type: 'LOGIN', role: acc.role, userId: acc.userId })
    navigate('/dashboard')
  }

  const submit = (e) => {
    e.preventDefault()
    const acc = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase())
    if (!acc) return setError(t("No demo account uses this email. Choose one of the demo accounts below."))
    if (password !== DEMO_PASSWORD) return setError(t("Incorrect demo password. It is shown below the form."))
    setError('')
    enter(acc)
  }

  const fill = (acc) => { setEmail(acc.email); setPassword(DEMO_PASSWORD); setError('') }

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
              {t("A working demonstration for Madarsa management, mentors, students and parents.")}
            </p>
          </div>

          <ul className="mt-8 hidden gap-3 text-[13px] text-sage-200 sm:grid sm:grid-cols-3 lg:mt-0">
            {['Operational control', 'Learning visibility', 'Parent communication'].map((x) => (
              <li key={x} className="flex items-center gap-2"><StarMotif className="h-4 w-4 shrink-0 text-gold-300" />{t(x)}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="relative -mt-8 rounded-t-[28px] bg-ivory px-5 pb-10 pt-7 sm:px-10 lg:mt-0 lg:flex lg:items-center lg:rounded-none">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto w-full max-w-md">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-2.5 py-1 text-[12px] font-bold text-gold-700">
            <Info size={13} /> {t("Demo prototype · fictional data")}
          </div>
          <h2 className="mt-3 text-[24px] font-extrabold">{t("Assalamu Alaikum")}</h2>
          <p className="mt-1 text-[14px] text-ink-muted">{t("Choose a role for one-tap access, or sign in with a demo account.")}</p>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {DEMO_ACCOUNTS.map((a, i) => {
              const Icon = ROLE_ICON[a.role]
              return (
                <motion.button key={a.role} type="button" onClick={() => enter(a)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}
                  className="group flex min-h-[96px] flex-col items-start justify-between rounded-2xl border border-line bg-white p-3.5 text-start shadow-card transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lift">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-100 text-primary-700 transition group-hover:bg-primary-700 group-hover:text-white"><Icon size={19} /></span>
                  <span className="mt-2 flex w-full items-center justify-between gap-1">
                    <span className="text-[14px] font-bold leading-tight text-forest">{t(a.label)}</span>
                    <ArrowRight size={16} className="shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-primary-700" />
                  </span>
                </motion.button>
              )
            })}
          </div>

          <div className="my-6 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
            <span className="h-px flex-1 bg-line" /> {t("or sign in")} <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-3.5" noValidate>
            <Input label={t("Email")} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@farooquia.demo" />
            <div className="relative">
              <Input label={t("Password")} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("Demo password")} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute bottom-0 end-1 flex h-11 w-11 items-center justify-center text-ink-muted" aria-label={show ? t("Hide password") : t("Show password")}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] font-medium text-clay-700" role="alert">{error}</p>}
            <Button type="submit" size="lg" className="w-full" icon={Lock}>{t("Sign in")}</Button>
          </form>

          <div className="mt-5 rounded-2xl border border-dashed border-line-strong bg-white/60 p-3.5">
            <p className="text-[12.5px] font-bold text-forest">{t("Demo credentials")} <span className="font-medium text-ink-muted">· {t("password")} <code className="rounded bg-ivory-100 px-1 font-mono text-[12px]">{DEMO_PASSWORD}</code></span></p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" onClick={() => fill(a)} className={cx('rounded-lg border border-line bg-white px-2 py-1.5 font-mono text-[12px] text-ink-soft hover:border-primary-300', email === a.email && 'border-primary-500 text-primary-700')}>
                  {a.email}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-muted">{t("Sign-in is simulated in your browser for demonstration only. These fictional accounts are not real credentials and this is not production security.")}</p>
          </div>
        </motion.div>
      </section>
    </div>
  )
}
