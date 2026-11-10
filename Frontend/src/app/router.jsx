import { t } from '../i18n/I18nProvider'
import { Button } from '../components/ui'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '../context/DemoStore'
import { ROUTE_ROLES } from '../constants/navigation'
import { useSmoothScroll } from '../hooks/useSmoothScroll'
import { useI18n } from '../i18n/I18nProvider'
import AppShell from '../components/layout/AppShell'
import Login from '../pages/auth/Login'
import Dashboard from '../pages/shared/Dashboard'
import Students from '../pages/admin/Students'
import StudentForm from '../pages/admin/StudentForm'
import StudentProfile from '../pages/shared/StudentProfile'
import Mentors from '../pages/admin/Mentors'
import MentorProfile from '../pages/admin/MentorProfile'
import Attendance from '../pages/shared/Attendance'
import RecordSabaq from '../pages/mentor/RecordSabaq'
import SabaqRecords from '../pages/shared/SabaqRecords'
import Journey from '../pages/student/Journey'
import ProgressReport from '../pages/parent/ProgressReport'
import Exams from '../pages/shared/Exams'
import ExamDetail from '../pages/shared/ExamDetail'
import ReportCard from '../pages/shared/ReportCard'
import Fees from '../pages/shared/Fees'
import Reminders from '../pages/admin/Reminders'
import PaymentSettings from '../pages/admin/PaymentSettings'
import PaymentVerification from '../pages/admin/PaymentVerification'
import Hostel from '../pages/admin/Hostel'
import Reports from '../pages/admin/Reports'
import Audit from '../pages/admin/Audit'
import Notifications from '../pages/shared/Notifications'
import Settings from '../pages/admin/Settings'
import { Forbidden, NotFound } from '../pages/shared/Fallbacks'
import { useAuth } from '../context/AuthContext'
import { AcceptInvite, ForgotPassword, MfaRecovery, ResetPassword } from '../pages/auth/TokenPages'
import InterimHome from '../pages/auth/InterimHome'
import Users from '../pages/admin/Users'
import Security from '../pages/account/Security'
import Organization from '../pages/org/Organization'
import Kiosks from '../pages/admin/Kiosks'
import StaffAttendance from '../pages/admin/StaffAttendance'
import MyAttendanceQr from '../pages/account/MyAttendanceQr'
import Payroll from '../pages/admin/Payroll'
import Halaqa from '../pages/halaqa/Halaqa'
import Mureeds from '../pages/halaqa/Mureeds'
import Website from '../pages/site/Website'
import Applications from '../pages/site/Applications'
import MyPayslips from '../pages/account/MyPayslips'

const Loading = () => <div className="flex min-h-dvh items-center justify-center bg-ivory" aria-busy="true"><span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-r-transparent" /></div>

function LoadFailed({ error, onRetry, onSignOut }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ivory px-6 text-center">
      <p className="font-bold text-forest">{t("Could not load your records")}</p>
      <p className="max-w-sm text-[13.5px] text-ink-muted">{t(error.message)}</p>
      <div className="flex gap-2">
        <Button onClick={onRetry}>{t("Try again")}</Button>
        <Button variant="secondary" onClick={onSignOut}>{t("Sign out")}</Button>
      </div>
    </div>
  )
}

// Every page below needs a full server session (password + MFA where required).
function RequireAuth({ children }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <Loading />
  if (auth.status !== 'full') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!auth.hasDemoView) return <InterimHome />
  if (auth.peopleError) return <LoadFailed error={auth.peopleError} onRetry={auth.refreshPeople} onSignOut={auth.logout} />
  if (!auth.demoReady) return <Loading />
  return children
}

// Sign-in, password and invitation pages: leave them once fully signed in.
function PublicOnly({ children }) {
  const auth = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'full') return <Navigate to="/dashboard" replace />
  return children
}

function Gate({ path, roles, perm, children }) {
  const { state } = useStore()
  const auth = useAuth()
  const allowed = roles || ROUTE_ROLES[path]
  if (allowed && !allowed.includes(state.session.persona || state.session.role)) return <Forbidden />
  if (perm && !auth.can(perm)) return <Forbidden />
  return children
}

export default function AppRoutes() {
  useSmoothScroll()
  const { lang } = useI18n()
  // Keyed by language so every page re-renders with the new strings and direction.
  return (
    <Routes key={lang}>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />
      <Route path="/accept-invite" element={<PublicOnly><AcceptInvite /></PublicOnly>} />
      <Route path="/mfa-recovery" element={<PublicOnly><MfaRecovery /></PublicOnly>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/students" element={<Gate path="/students"><Students /></Gate>} />
        <Route path="/students/new" element={<Gate path="/students/new"><StudentForm /></Gate>} />
        <Route path="/students/:id" element={<Gate path="/students"><StudentProfile /></Gate>} />
        <Route path="/students/:id/edit" element={<Gate roles={['admin']}><StudentForm /></Gate>} />
        <Route path="/mentors" element={<Gate path="/mentors"><Mentors /></Gate>} />
        <Route path="/mentors/:id" element={<Gate path="/mentors"><MentorProfile /></Gate>} />
        <Route path="/attendance" element={<Gate path="/attendance"><Attendance /></Gate>} />
        <Route path="/sabaq/new" element={<Gate path="/sabaq/new"><RecordSabaq /></Gate>} />
        <Route path="/sabaq" element={<Gate path="/sabaq"><SabaqRecords /></Gate>} />
        <Route path="/journey" element={<Gate path="/journey"><Journey /></Gate>} />
        <Route path="/progress-report" element={<Gate path="/progress-report"><ProgressReport /></Gate>} />
        <Route path="/exams" element={<Gate path="/exams"><Exams /></Gate>} />
        <Route path="/exams/:id" element={<Gate roles={['admin', 'mentor']}><ExamDetail /></Gate>} />
        <Route path="/report-card/:id" element={<Gate path="/exams"><ReportCard /></Gate>} />
        <Route path="/fees" element={<Gate path="/fees"><Fees /></Gate>} />
        <Route path="/reminders" element={<Gate path="/reminders"><Reminders /></Gate>} />
        <Route path="/payment-settings" element={<Gate path="/payment-settings"><PaymentSettings /></Gate>} />
        <Route path="/payment-verification" element={<Gate path="/payment-verification"><PaymentVerification /></Gate>} />
        <Route path="/hostel" element={<Gate path="/hostel"><Hostel /></Gate>} />
        <Route path="/reports" element={<Gate path="/reports"><Reports /></Gate>} />
        <Route path="/audit" element={<Gate path="/audit"><Audit /></Gate>} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Gate path="/settings"><Settings /></Gate>} />
        <Route path="/admin/users" element={<Gate path="/admin/users"><Users /></Gate>} />
        <Route path="/kiosks" element={<Gate path="/kiosks" perm="kiosks.manage"><Kiosks /></Gate>} />
        <Route path="/staff-attendance" element={<Gate path="/staff-attendance" perm="staff_attendance.read"><StaffAttendance /></Gate>} />
        <Route path="/my-attendance" element={<Gate path="/my-attendance"><MyAttendanceQr /></Gate>} />
        <Route path="/halaqa" element={<Gate path="/halaqa"><Halaqa /></Gate>} />
        <Route path="/mureeds" element={<Gate path="/mureeds" perm="mureeds.read"><Mureeds /></Gate>} />
        <Route path="/website" element={<Gate path="/website" perm="site.manage"><Website /></Gate>} />
        <Route path="/applications" element={<Gate path="/applications" perm="applications.read"><Applications /></Gate>} />
        <Route path="/payroll" element={<Gate path="/payroll" perm="payroll.read"><Payroll /></Gate>} />
        <Route path="/my-payslips" element={<Gate path="/my-payslips"><MyPayslips /></Gate>} />
        <Route path="/organization" element={<Gate path="/organization" perm="org.manage"><Organization /></Gate>} />
        <Route path="/account/security" element={<Security />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
