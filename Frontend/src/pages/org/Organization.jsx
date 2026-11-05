import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Power } from 'lucide-react'
import { get, patch, post, put } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, Select } from '../../components/ui'

// Super Admin: the organization's madrasas, which modules each one uses, and new
// madrasas (optionally starting from another madrasa's settings). The server
// checks org.manage on every call.
const FEATURES = [
  ['FEES', 'Fees'], ['HOSTEL', 'Hostel'], ['ASSESSMENTS', 'Examinations'], ['SCHEDULED_REPORTS', 'Scheduled reports'],
  ['NAMAZ_TRACKING', 'Namaz tracking'], ['ACCOUNTS', 'Accounts'], ['STAFF_ATTENDANCE', 'Staff attendance'], ['BIOMETRIC', 'Biometric'],
]
const BLANK = { code: '', name: '', shortName: '', address: '', phone: '', email: '', copyFrom: '' }

export default function Organization() {
  const auth = useAuth()
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [items, setItems] = useState(null)
  const [features, setFeatures] = useState({})
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const load = useCallback(async () => {
    try {
      const r = await get('/org/madrasas')
      setItems(r.items)
      setFeatures(Object.fromEntries(r.items.map((m) => [m.id, m.features])))
    } catch (e) {
      setError(e)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (m, feature, on) => {
    try {
      const next = await put(`/org/madrasas/${m.id}/features`, { [feature]: on })
      setFeatures((f) => ({ ...f, [m.id]: next }))
      toast(t('{name}: {module} switched {state}', { name: m.shortName, module: t(FEATURES.find(([k]) => k === feature)[1]), state: on ? t('on') : t('off') }))
      if (m.id === auth.user?.madrasa?.id) auth.refresh()
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const setActive = (m, active) => run(() => patch(`/org/madrasas/${m.id}`, { active })).then(() => { toast(active ? t('Madrasa reactivated') : t('Madrasa deactivated')); load(); auth.refresh() }, (e) => { if (e.code !== 'CANCELLED') toast(e.message, { type: 'error' }) })

  const create = async () => {
    setFieldErrors({})
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
    try {
      const m = await run(() => post('/org/madrasas', body))
      toast(t('{name} added', { name: m.name }))
      setForm(null)
      await load()
      auth.refresh()
    } catch (e) {
      if (e.code === 'CANCELLED') return
      setFieldErrors({ ...e.fieldErrors, _: e.code === 'VALIDATION_FAILED' ? '' : e.message })
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('Madrasas')} subtitle={t('The madrasas of the organization, and the modules each one uses')}
        actions={<Button icon={Plus} onClick={() => setForm({ ...BLANK })}>{t('Add madrasa')}</Button>} />
      {error && <Notice tone="red" className="mb-4">{t(error.message)}</Notice>}
      {items && !items.length && <EmptyState icon={Building2} title={t('No madrasas yet')}>{t('Add the first madrasa to start.')}</EmptyState>}
      <div className="space-y-4">
        {items?.map((m) => (
          <Card key={m.id}>
            <CardHeader icon={Building2} title={m.name} subtitle={`${m.code} · ${t('{n} active students', { n: m.students })} · ${t('{n} staff roles', { n: m.staff })}`}
              action={<div className="flex items-center gap-2">
                {m.active ? <Badge tone="green">{t('Active')}</Badge> : <Badge tone="neutral">{t('Inactive')}</Badge>}
                <Button size="sm" variant="ghost" icon={Power} onClick={() => setActive(m, !m.active)}>{m.active ? t('Deactivate') : t('Reactivate')}</Button>
              </div>} />
            {m.active && features[m.id] && (
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <p className="mb-2 text-[12.5px] font-semibold text-ink-muted">{t('Modules')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FEATURES.map(([key, label]) => (
                    <label key={key} className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-line px-3 text-[13.5px] font-semibold">
                      {t(label)}
                      <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={!!features[m.id][key]} onChange={(e) => toggle(m, key, e.target.checked)} />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-ink-muted">{t('A module that is off is refused by the server for everyone in this madrasa, not only hidden from the menu.')}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={t('Add madrasa')} subtitle={t('Its people, fees and bank details start empty.')}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={create}>{t('Add madrasa')}</Button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('Code')} hint={t('Short and unique, e.g. HYD2')} value={form.code} onChange={set('code')} error={fieldErrors.code} required />
            <Input label={t('Short name')} value={form.shortName} onChange={set('shortName')} error={fieldErrors.shortName} required />
            <Input className="sm:col-span-2" label={t('Name')} value={form.name} onChange={set('name')} error={fieldErrors.name} required />
            <Input className="sm:col-span-2" label={t('Address')} value={form.address} onChange={set('address')} error={fieldErrors.address} />
            <Input label={t('Phone')} value={form.phone} onChange={set('phone')} error={fieldErrors.phone} />
            <Input label={t('Email')} type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} required />
            <Select className="sm:col-span-2" label={t('Start from the settings of')} value={form.copyFrom} onChange={set('copyFrom')}
              options={[{ value: '', label: t('Default settings') }, ...(items ?? []).filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))]}
              hint={t('Copies configuration, modules, grading scale and reminder settings. Never people, money or bank details.')} />
            {fieldErrors._ && <p className="text-[13px] text-clay-600 sm:col-span-2" role="alert">{fieldErrors._}</p>}
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  )
}
