import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, GraduationCap, UserRound, Users, RotateCcw, PlayCircle, Info, Check } from 'lucide-react'
import { Modal, Button, ConfirmDialog, Tabs, cx, Notice } from '../ui'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { DEMO_ACCOUNTS } from '../../constants/config'
import { ROLE_LABELS } from '../../constants/labels'

const ROLE_ICON = { admin: ShieldCheck, mentor: UserRound, student: GraduationCap, parent: Users }

export const GUIDE_STEPS = [
  { role: 'admin', to: '/dashboard', title: 'Open the admin dashboard', note: 'Enrolment, attendance, fees and the action centre at a glance.' },
  { role: 'admin', to: '/attendance', title: 'Review attendance, then fees', note: 'Tap any count to see the students behind it.' },
  { role: 'admin', to: '/students/S-1001', title: "Open Abdullah Khan's profile", note: 'Tabs for attendance, Sabaq, exams, fees, guardian and hostel.' },
  { role: 'mentor', to: '/sabaq/new?student=S-1001', title: 'Record a Sabaq lesson as the mentor', note: "Abdullah's lesson for today is still pending." },
  { role: 'student', to: '/journey', title: "Switch to Abdullah's account", note: 'The new record appears in his learning journey.' },
  { role: 'parent', to: '/dashboard', title: "Review the child's progress as parent", note: 'Javed Khan has two linked children.' },
  { role: 'parent', to: '/fees', title: 'Open fees and make a simulated payment', note: 'No real payment details are collected.' },
  { role: 'parent', to: '/fees', title: 'See the outstanding balance update', note: 'Receipts and balances update together.' },
  { role: 'parent', to: '/progress-report', title: 'Preview the monthly progress report', note: 'Print-friendly; can be saved as PDF from the print dialog.' },
  { role: 'admin', to: '/dashboard', title: 'Return to the admin dashboard', note: 'Fee collection and the activity log reflect the changes.' },
]

export function useSwitchRole() {
  const { dispatch } = useStore()
  const navigate = useNavigate()
  return (role, to = '/dashboard') => {
    const acc = DEMO_ACCOUNTS.find((a) => a.role === role)
    dispatch({ type: 'LOGIN', role, userId: acc.userId })
    navigate(to)
  }
}

export default function DemoPanel({ open, onClose }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const switchRole = useSwitchRole()
  const navigate = useNavigate()
  const [tab, setTab] = useState('roles')
  const [confirm, setConfirm] = useState(false)
  const [step, setStep] = useState(0)

  const go = (role, to) => {
    switchRole(role, to)
    onClose()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={t("Demo Mode")} subtitle={t("Switch roles, follow the presentation guide, or reset sample data.")} size="md">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'roles', label: 'Switch role' }, { value: 'guide', label: 'Presentation guide' }, { value: 'about', label: 'About' }]} className="mb-4" />

        {tab === 'roles' && (
          <div className="space-y-2.5">
            {DEMO_ACCOUNTS.map((a) => {
              const Icon = ROLE_ICON[a.role]
              const active = state.session?.role === a.role
              return (
                <button key={a.role} type="button" onClick={() => go(a.role, '/dashboard')}
                  className={cx('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition', active ? 'border-primary-600 bg-primary-50' : 'border-line hover:border-primary-300 hover:bg-ivory-50')}>
                  <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary-700 text-white' : 'bg-sage-100 text-primary-700')}><Icon size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-forest">{t(a.label)}</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">{a.email} · {t(a.blurb)}</span>
                  </span>
                  {active && <Check size={18} className="text-primary-600" aria-label={t("Current role")} />}
                </button>
              )
            })}
            <div className="pt-2">
              <Button variant="danger-soft" icon={RotateCcw} className="w-full" onClick={() => setConfirm(true)}>{t("Reset demo data")}</Button>
              <p className="mt-1.5 text-center text-[12px] text-ink-muted">{t("Changes are saved in this browser until you reset.")}</p>
            </div>
          </div>
        )}

        {tab === 'guide' && (
          <ol className="space-y-2">
            {GUIDE_STEPS.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => { setStep(i + 1); go(s.role, s.to) }}
                  className={cx('flex w-full items-start gap-3 rounded-2xl border p-3 text-start transition hover:border-primary-300', i < step ? 'border-primary-200 bg-primary-50/50' : 'border-line')}>
                  <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', i < step ? 'bg-primary-600 text-white' : 'bg-gold-50 text-gold-700 ring-1 ring-gold-200')}>{i < step ? <Check size={14} /> : i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-forest">{t(s.title)}</span>
                    <span className="block text-[12.5px] text-ink-muted">{t(s.note)}</span>
                  </span>
                  <span className="mt-0.5 shrink-0 rounded-md bg-ivory-100 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-ink-soft">{t(ROLE_LABELS[s.role])}</span>
                </button>
              </li>
            ))}
            <li className="flex items-center gap-2 pt-1 text-[12.5px] text-ink-muted"><PlayCircle size={15} /> {t("Each step switches to the right role and opens the page.")}</li>
          </ol>
        )}

        {tab === 'about' && (
          <div className="space-y-3 text-[14px] text-ink-soft">
            <Notice tone="gold" icon={Info}>{t("This is a static frontend prototype with fictional sample data. Nothing is sent to a server.")}</Notice>
            <ul className="list-disc space-y-1.5 ps-5">
              <li>{t("Sign-in and role permissions are simulated in the browser. They are not production security.")}</li>
              <li>{t("Payments use a demonstration checkout. No card or bank details are collected and no money moves.")}</li>
              <li>{t("SMS, WhatsApp and email reminders are previewed and marked as sent locally; nothing is transmitted.")}</li>
              <li>{t("Library uploads and records are stored in this browser only.")}</li>
              <li>{t("The activity log is a demonstration and not a tamper-proof audit trail.")}</li>
            </ul>
            <p>{t("A production rollout would add a secure backend (e.g. MERN), real authentication, payment and messaging integrations, backups and data migration as separate phases.")}</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t("Reset all demo data?")} confirmLabel={t("Reset data")} tone="danger"
        onConfirm={() => { dispatch({ type: 'RESET' }); navigate('/dashboard'); toast('Demo data restored', { description: 'All sample records are back to their original state.' }); onClose() }}>
        {t("Every change made during this demo — attendance, Sabaq records, payments, students and settings — will be replaced with the original sample dataset.")}
      </ConfirmDialog>
    </>
  )
}
