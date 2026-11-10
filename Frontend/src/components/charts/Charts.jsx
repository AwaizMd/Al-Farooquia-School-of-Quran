import { t } from "../../i18n/I18nProvider"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line, LabelList } from 'recharts'
import { Card, CardHeader } from '../ui'
import { money, compactMoney } from '../../utils/format'

// Validated categorical palette (colour-blind separation checked).
export const C = { green: '#0E8060', gold: '#B98A2E', blue: '#3F6CC0', red: '#C0553D', grid: '#ECE7DC', muted: '#9AA19B' }

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: '#6B726C' } }

function TipBox({ active, payload, label, fmt = (v) => v, labelFmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12.5px] shadow-pop">
      {label != null && <p className="mb-1 font-bold text-forest">{labelFmt ? labelFmt(label) : label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {t(p.name)}: <span className="font-semibold text-forest tabular">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function LegendRow({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-1 text-[12px] text-ink-soft sm:px-5">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{t(i.label)}</li>)}
    </ul>
  )
}

export function ChartCard({ title, subtitle, action, children, legend, footer, height = 220 }) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {legend && <div className="mt-3"><LegendRow items={legend} /></div>}
      <div className="px-2 pb-3 pt-2 sm:px-3" style={{ height }}>{children}</div>
      {footer && <div className="mt-auto border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted sm:px-5">{footer}</div>}
    </Card>
  )
}

export function AttendanceTrendChart({ data }) {
  // data: [{ label, present, late, absent, excused }]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip content={<TipBox />} cursor={{ fill: 'rgba(14,128,96,0.06)' }} />
        <Bar dataKey="present" name={t("Present")} stackId="a" fill={C.green} stroke="#fff" strokeWidth={1} />
        <Bar dataKey="late" name={t("Late")} stackId="a" fill={C.gold} stroke="#fff" strokeWidth={1} />
        <Bar dataKey="excused" name={t("Excused")} stackId="a" fill={C.blue} stroke="#fff" strokeWidth={1} />
        <Bar dataKey="absent" name={t("Absent")} stackId="a" fill={C.red} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
export const ATTENDANCE_LEGEND = [{ label: 'Present', color: C.green }, { label: 'Late', color: C.gold }, { label: 'Excused', color: C.blue }, { label: 'Absent', color: C.red }]

/**
 * One bar per week with its value printed on top, so nobody has to read an axis.
 * data: [{ label, [dataKey]: number | null }]. A null week shows its date with no bar.
 */
/** Week start as two short lines (day, then month only where it changes), so eight weeks never overlap. */
function WeekTick({ x, y, payload, index, data }) {
  const d = new Date(`${data[index]?.from}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const month = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
  const prev = index > 0 ? new Date(`${data[index - 1].from}T00:00:00Z`).getUTCMonth() : -1
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={10} textAnchor="middle" fontSize={11} fill="#4B544E">{d.getUTCDate()}</text>
      {(index === 0 || d.getUTCMonth() !== prev) && <text dy={23} textAnchor="middle" fontSize={10} fill="#8A918B">{month}</text>}
    </g>
  )
}

export function WeeklyBars({ data, dataKey, name, max, fmt = (v) => v, colorFor = () => C.green }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 22, right: 4, left: 4, bottom: 4 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} interval={0} height={36} tick={(p) => <WeekTick {...p} data={data} />} />
        <YAxis hide domain={[0, max ?? 'auto']} />
        <Tooltip content={<TipBox fmt={fmt} />} cursor={{ fill: 'rgba(14,128,96,0.06)' }} />
        <Bar dataKey={dataKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d[dataKey] == null ? 'transparent' : colorFor(d[dataKey])} />)}
          <LabelList dataKey={dataKey} position="top" formatter={(v) => (v == null ? '' : fmt(v))} style={{ fontSize: 11, fontWeight: 700, fill: '#1F3B33' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Totals as labelled horizontal bars: "New lesson ████ 9 safah". rows: [{ label, value, color }] */
export function TotalsList({ rows, unit }) {
  const top = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-1.5 px-4 pb-3 sm:px-5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[76px_1fr_auto] items-center gap-2 text-[12.5px]">
          <span className="truncate text-ink-soft">{t(r.label)}</span>
          <span className="h-2.5 rounded-full bg-ivory-100"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (r.value / top) * 100)}%`, background: r.color }} /></span>
          <span className="font-semibold tabular text-forest">{r.value} {t(unit)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Safah (or Qaida lessons) per week, stacked by lesson type. data: [{ label, sabaq, sabqi, ... }] */
export function SabaqVolumeChart({ data, series }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} allowDecimals />
        <Tooltip content={<TipBox />} cursor={{ fill: 'rgba(14,128,96,0.06)' }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Average lesson rating per week on the 1-5 scale; weeks with no rated lesson leave a gap. */
export function RatingLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
        <Tooltip content={<TipBox fmt={(v) => `${v} / 5`} />} />
        <Line type="monotone" dataKey="rating" name={t("Average rating")} stroke={C.green} strokeWidth={2} connectNulls={false} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function AttendanceRateLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} minTickGap={16} />
        <YAxis {...axis} domain={[60, 100]} unit="%" />
        <Tooltip content={<TipBox fmt={(v) => `${v}%`} />} />
        <Line type="monotone" dataKey="rate" name={t("Attendance")} stroke={C.green} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function FeeCollectionChart({ data, currency }) {
  // data: [{ label, collected, billed }]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} barGap={2} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} tickFormatter={(v) => compactMoney(v, currency)} width={52} />
        <Tooltip content={<TipBox fmt={(v) => money(v, currency)} />} cursor={{ fill: 'rgba(14,128,96,0.06)' }} />
        <Bar dataKey="billed" name={t("Billed")} fill="#D3E0D5" radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" name={t("Collected")} fill={C.green} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({ data, center, fmt = (v) => v }) {
  // data: [{ name, value, color }]
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={<TipBox fmt={fmt} />} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center(total)}</div>}
    </div>
  )
}

export function HorizontalBars({ data, color = C.green, fmt = (v) => v, onSelect }) {
  // Plain HTML bars: crisper on small screens than an SVG chart and keyboard friendly.
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const Comp = onSelect ? 'button' : 'div'
        return (
          <li key={d.label}>
            <Comp type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(d) : undefined} className="group block w-full text-start" title={`${t(d.label)}: ${fmt(d.value)}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate font-semibold text-ink-soft group-hover:text-primary-700">{t(d.label)}</span>
                <span className="shrink-0 font-bold text-forest tabular">{fmt(d.value)}{d.suffix}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-sage-100">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.value / max) * 100}%`, background: d.color || color }} />
              </div>
            </Comp>
          </li>
        )
      })}
    </ul>
  )
}

export { Legend }
