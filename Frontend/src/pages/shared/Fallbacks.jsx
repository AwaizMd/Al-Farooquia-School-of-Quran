import { t } from "../../i18n/I18nProvider"
import { Lock, Compass } from 'lucide-react'
import { Card, EmptyState, Button } from '../../components/ui'

export function Forbidden() {
  return (
    <Card>
      <EmptyState icon={Lock} title={t("Not available for this role")} action={<Button to="/dashboard">{t("Back to dashboard")}</Button>}>
        {t("This page or record is not available to your account.")}
      </EmptyState>
    </Card>
  )
}

export function NotFound() {
  return (
    <Card>
      <EmptyState icon={Compass} title={t("Page not found")} action={<Button to="/dashboard">{t("Back to dashboard")}</Button>}>
        {t("The record may have been removed or the link is incorrect.")}
      </EmptyState>
    </Card>
  )
}
