import { t } from "../../i18n/I18nProvider"
import { Badge } from '../ui'
import { ATTENDANCE, LEARNING_STATUS, FEE_STATUS, RATINGS, TAJWEED, TARGET_STATUS, SABAQ_CATEGORIES } from '../../constants/labels'

export const AttendanceBadge = ({ status }) =>
  status ? <Badge tone={t(ATTENDANCE[status].tone)}>{t(ATTENDANCE[status].label)}</Badge> : <Badge tone="neutral">{t("Not marked")}</Badge>

export const LearningBadge = ({ status }) => <Badge tone={t(LEARNING_STATUS[status].tone)}>{t(LEARNING_STATUS[status].label)}</Badge>

export const FeeBadge = ({ status }) => <Badge tone={t(FEE_STATUS[status].tone)}>{t(FEE_STATUS[status].label)}</Badge>

export const RatingBadge = ({ value, prefix }) => value ? <Badge tone={t(RATINGS[value].tone)}>{prefix}{t(RATINGS[value].label)}</Badge> : null

export const TajweedBadge = ({ value }) => <Badge tone={t(TAJWEED[value].tone)}>{t("Tajweed")}: {t(TAJWEED[value].label)}</Badge>

export const TargetBadge = ({ value }) => <Badge tone={t(TARGET_STATUS[value].tone)}>{t(TARGET_STATUS[value].label)}</Badge>

const CAT_TONE = { sabaq: 'dark', sabqi: 'green', manzil: 'gold', nazira: 'blue', qaida: 'neutral' }
export const CategoryBadge = ({ value }) => <Badge tone={CAT_TONE[value]}>{t(SABAQ_CATEGORIES[value].short)}</Badge>

export function RatingDots({ value, max = 5 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i < value ? (value >= 4 ? 'bg-primary-600' : value === 3 ? 'bg-gold-500' : 'bg-clay-500') : 'bg-sage-200'}`} />
      ))}
    </span>
  )
}
