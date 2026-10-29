import { t } from "../../i18n/I18nProvider"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'
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
      {footer && <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted sm:px-5">{footer}</div>}
    </Card>
  )
}

export function AttendanceTrendChart({ data }) {
  // data: [{ label, present, late, absent, excused }]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} interval={0} />
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
