import { t } from "../../i18n/I18nProvider"
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Logo, Notice } from '../../components/ui'
import Security from '../account/Security'
import Users from '../admin/Users'

// TRANSITIONAL: Principal and Warden dashboards are built with the people and
// hostel modules (Phase 3). Until then these roles get their account security
// page, and the Principal can view accounts.
export default function InterimHome() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-dvh bg-ivory">
      <header className="border-b border-line bg-white/70">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Logo size={34} />
          <p className="flex-1 truncate font-bold text-forest">{user.displayName}</p>
          <Button variant="ghost" icon={LogOut} onClick={logout}>{t("Sign out")}</Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Notice tone="gold">{t("Your dashboard is being prepared and will appear here in the next release. You can manage your account security now.")}</Notice>
        <Security />
        {user.roles.includes('PRINCIPAL') && <Users />}
      </main>
    </div>
  )
}
