import { t, brandName } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, BookOpen, MessageSquareQuote, CalendarClock, Wallet, FileText, Sprout, CreditCard, Receipt, Phone } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useActiveChild } from '../../hooks/useScope'
import { Card, CardHeader, Button, ProgressBar, Avatar, Badge, FadeIn, ProgressRing } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { AttendanceBadge, RatingBadge, LearningBadge, FeeBadge, TajweedBadge } from '../../components/cards/StatusBadges'
import { RecordRange } from '../../features/sabaq/SabaqViews'
import { CheckoutModal, PaymentHistory, ReceiptModal } from '../../features/fees/FeeViews'
import { currentLevel, recordsFor, studentAttendance, studentFees, learningStatus, latestTarget, latestSchoolDay, isMain } from '../../services/selectors'
import { monthKey, fmtDate, diffDays, relativeDay } from '../../utils/date'
import { money } from '../../utils/format'

export default function ParentDashboard() {
  const { state, idx, today } = useStore()
  const { child, children } = useActiveChild()
  const parent = idx.parents[state.session.userId]
  const [pay, setPay] = useState(false)
  const [receipt, setReceipt] = useState(null)
  if (!child) return null
  const cur = state.settings.currency
  const group = idx.groups[child.groupId]
  const mentor = idx.mentors[group?.mentorId]
  const level = currentLevel(state, idx, child.id)
  const monthAtt = studentAttendance(state, child.id, { from: `${monthKey(today)}-01` })
  const todayStatus = state.attendance[latestSchoolDay(idx, today)]?.[child.id]
  const recs = recordsFor(idx, child.id)
  const latest = level.latest
  const ls = learningStatus(idx, child.id, today)
  const fees = studentFees(state, idx, child.id)
  const exams = state.exams.filter((e) => e.groupIds.includes(child.groupId) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
  const familyBalance = children.reduce((a, c) => a + studentFees(state, idx, c.id).balance, 0)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-ink-muted">{t("Assalamu Alaikum,")} {parent.name}</p>
        <h1 className="text-[22px] font-extrabold sm:text-[26px]">{t("Your {kids} at {brand}", { kids: t(children.length > 1 ? "children" : "child"), brand: brandName(state.settings) })}</h1>
      </div>
      <ChildSwitcher />

      <FadeIn key={child.id}>
        <Card className="pattern-stars overflow-hidden p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <Avatar name={child.name} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-extrabold text-forest">{child.name}</p>
              <p className="text-[13px] text-ink-muted">{t(group?.name)} · {t("Mentor: {name}", { name: mentor?.name })}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><AttendanceBadge status={todayStatus} /><LearningBadge status={ls.key} /></div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold text-ink-soft">{level.label}</span>{level.progress != null && <span className="text-ink-muted">{level.progress}%</span>}</div>
            {level.progress != null && <ProgressBar value={level.progress} label={t("Learning progress")} />}
            <p className="mt-2 text-[13px] text-ink-soft"><span className="font-semibold text-forest">{t("Next target:")}</span> {t(latestTarget(idx, child.id))}</p>
          </div>
        </Card>
      </FadeIn>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={t("Attendance this month")} icon={CalendarCheck} />
          <div className="flex items-center gap-4 p-4 sm:px-5">
            <ProgressRing value={monthAtt.rate ?? 0} size={76} label={t("Monthly attendance")}><span className="text-[16px] font-extrabold text-forest">{monthAtt.rate ?? 0}%</span></ProgressRing>
            <div className="text-[13px] text-ink-soft">
              <p>{t("{p} present · {l} late", { p: monthAtt.present, l: monthAtt.late })}</p>
              <p>{t("{a} absent · {e} excused", { a: monthAtt.absent, e: monthAtt.excused })}</p>
              <Link to="/journey" className="mt-1 inline-block font-semibold text-primary-700 hover:underline">{t("See learning report")}</Link>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Latest Sabaq")} icon={BookOpen} action={<Button size="sm" variant="ghost" to="/sabaq">{t("All")}</Button>} />
          {latest ? (
            <div className="space-y-2 p-4 sm:px-5">
              <p className="text-[14px] font-bold text-forest"><RecordRange r={latest} /></p>
              <div className="flex flex-wrap gap-1.5"><RatingBadge value={latest.performance} /><TajweedBadge value={latest.tajweed} /></div>
              <p className="text-[12.5px] text-ink-muted">{relativeDay(latest.date, today)} · {t("{n} mistakes", { n: latest.mistakes })}</p>
            </div>
          ) : <p className="p-5 text-[13px] text-ink-muted">{t("No records yet.")}</p>}
        </Card>

        <Card>
          <CardHeader title={t("Mentor feedback")} subtitle={mentor?.name} icon={MessageSquareQuote} />
          <div className="space-y-2 p-4 sm:px-5">
            {recs.filter((r) => isMain(idx, r) && r.comments).slice(0, 2).map((r) => (
              <blockquote key={r.id} className="rounded-2xl bg-sage-50 p-3 text-[13.5px] text-ink">
                <p className="text-[11.5px] font-bold text-primary-700">{fmtDate(r.date)}</p>“{t(r.comments)}”
              </blockquote>
            ))}
            <p className="flex items-center gap-1.5 pt-1 text-[12px] text-ink-muted"><Phone size={13} /> {t("Mentor contact:")} {mentor?.phone}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Upcoming assessments")} icon={CalendarClock} />
          <ul className="space-y-2 p-4 sm:px-5">
            {exams.length ? exams.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                <span><span className="block text-[13.5px] font-bold text-forest">{t(e.title)}</span><span className="text-[12px] text-ink-muted">{fmtDate(e.date)}</span></span>
                <Badge tone="gold">{t("in")} {diffDays(e.date, today)} {t("days")}</Badge>
              </li>
            )) : <li className="text-[13px] text-ink-muted">{t("Nothing scheduled.")}</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("Fees")} subtitle={children.length > 1 ? t("Family total outstanding: {amount}", { amount: money(familyBalance, cur) }) : undefined} icon={Wallet} action={<FeeBadge status={fees.status} />} />
        <div className="grid gap-4 p-4 sm:px-5 md:grid-cols-2">
          <div>
            <p className="text-[12.5px] text-ink-muted">{t("Outstanding for {name}", { name: child.name.split(' ')[0] })}</p>
            <p className={`text-[30px] font-extrabold tabular ${fees.balance ? 'text-clay-600' : 'text-primary-700'}`}>{money(fees.balance, cur)}</p>
            <p className="text-[13px] text-ink-muted">{fees.nextDue ? `${t("Next due: {date}", { date: fmtDate(fees.nextDue.dueDate) })}${fees.overdue ? ` · ${t("{amount} overdue", { amount: money(fees.overdue, cur) })}` : ''}` : child.concession?.percent >= 100 ? t("Fully sponsored — no dues") : t("All dues cleared. JazakAllahu khairan.")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="gold" icon={CreditCard} onClick={() => setPay(true)} disabled={!fees.balance}>{t("Pay fees (demo)")}</Button>
              <Button variant="secondary" icon={Receipt} to="/fees">{t("Fee details")}</Button>
            </div>
          </div>
          <div className="rounded-2xl border border-line">
            <p className="px-4 pt-3 text-[12px] font-bold uppercase tracking-wider text-ink-muted">{t("Recent payments")}</p>
            <PaymentHistory payments={fees.payments.slice(0, 3)} currency={cur} onReceipt={setReceipt} />
          </div>
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="soft" icon={Sprout} to="/journey">{t("Learning report")}</Button>
        <Button variant="soft" icon={FileText} to="/progress-report">{t("Preview monthly progress report")}</Button>
      </div>

      <CheckoutModal open={pay} onClose={() => setPay(false)} student={child} />
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}
