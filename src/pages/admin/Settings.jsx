import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Save, RotateCcw, Building2, Info } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Input, Select, Button, ConfirmDialog, Notice } from '../../components/ui'
import { CURRENCIES, DEFAULT_SETTINGS } from '../../constants/config'

export default function Settings() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [f, setF] = useState(state.settings)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = () => {
    if (f.brandName.trim().length < 2) return setError('Enter the Madarsa name.')
    setError('')
    const patch = Object.fromEntries(Object.entries(f).filter(([k, v]) => state.settings[k] !== v).map(([k, v]) => [k, k === 'weeklyOff' ? Number(v) : v]))
    if (!Object.keys(patch).length) return toast('No changes to save', { type: 'info' })
    dispatch({ type: 'UPDATE_SETTINGS', patch })
    toast('Settings saved', { description: 'Branding and currency are updated across the app.' })
  }
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Settings")} subtitle={t("Branding and demo configuration")} />
      <Card className="mb-4">
        <CardHeader title={t("Madarsa details")} subtitle={t("Replace the provisional brand with the real institution")} icon={Building2} />
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
          <Input label={t("Madarsa name")} value={f.brandName} onChange={set('brandName')} error={error} />
          <Input label={t("Arabic name")} value={f.brandArabic} onChange={set('brandArabic')} dir="rtl" lang="ar" />
          <Input className="sm:col-span-2" label={t("Tagline")} value={f.tagline} onChange={set('tagline')} />
          <Input className="sm:col-span-2" label={t("Address")} value={f.address} onChange={set('address')} />
          <Input label={t("Phone")} value={f.phone} onChange={set('phone')} />
          <Input label={t("Email")} value={f.email} onChange={set('email')} />
          <Select label={t("Currency")} value={f.currency} onChange={set('currency')} options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: c.label }))} />
          <Select label={t("Weekly holiday")} value={f.weeklyOff} onChange={set('weeklyOff')} options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: i, label: d }))} />
          <Notice tone="blue" icon={Info} className="sm:col-span-2">{t("Changing the currency changes the symbol only; sample amounts are not converted. The logo can be replaced in")} <code>src/components/ui</code> and <code>public/logo.svg</code>.</Notice>
          <Button icon={Save} onClick={save} className="sm:col-span-2">{t("Save settings")}</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("Demo data")} subtitle={t("All changes are stored in this browser (localStorage)")} icon={RotateCcw} />
        <div className="p-4 sm:p-5">
          <Button variant="danger-soft" icon={RotateCcw} onClick={() => setConfirm(true)}>{t("Reset demo data")}</Button>
        </div>
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t("Reset all demo data?")} confirmLabel={t("Reset")} tone="danger"
        onConfirm={() => { dispatch({ type: 'RESET' }); setF(DEFAULT_SETTINGS); toast('Demo data restored') }}>
        {t("This restores the original sample students, records, payments and settings.")}
      </ConfirmDialog>
    </div>
  )
}
