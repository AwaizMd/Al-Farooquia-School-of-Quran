import { t } from "../../i18n/I18nProvider"
import { addDays, fromISO, weekday, fmtDay } from '../../utils/date'
import { ATTENDANCE } from '../../constants/labels'
import { cx } from '../../components/ui'

const CELL = {
  present: 'bg-primary-600 text-white',
  late: 'bg-gold-500 text-white',
  absent: 'bg-clay-500 text-white',
  excused: 'bg-slateblue-500 text-white',
}

// Five-week calendar heatmap. Letters inside each cell keep it readable without colour.
export default function AttendanceCalendar({ history, today, weeklyOff = 5, weeks = 5 }) {
  const map = Object.fromEntries(history.map((h) => [h.date, h.status]))
  const offset = (weekday(today) + 6) % 7 // Monday-first
  const start = addDays(today, -offset - (weeks - 1) * 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-ink-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const s = map[d]
          const future = d > today
          const off = weekday(d) === weeklyOff
          return (
            <div key={d} title={`${fmtDay(d)}: ${s ? ATTENDANCE[s].label : off ? 'Weekly holiday' : future ? '' : 'No record'}`}
              className={cx('flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] font-bold leading-none',
                s ? CELL[s] : future ? 'bg-transparent text-ink-muted/30' : off ? 'bg-ivory-100 text-ink-muted/60' : 'border border-dashed border-line-strong text-ink-muted/60',
                d === today && 'ring-2 ring-gold-400 ring-offset-1')}>
              <span>{fromISO(d).getDate()}</span>
              {s && <span className="mt-0.5 text-[9px] opacity-90">{t(ATTENDANCE[s].short)}</span>}
            </div>
          )
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
        {Object.entries(ATTENDANCE).map(([k, v]) => <li key={k} className="flex items-center gap-1"><span className={cx('h-2.5 w-2.5 rounded-sm', CELL[k].split(' ')[0])} />{v.label} ({v.short})</li>)}
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ivory-100 ring-1 ring-line" />{t("Holiday")}</li>
      </ul>
    </div>
  )
}
