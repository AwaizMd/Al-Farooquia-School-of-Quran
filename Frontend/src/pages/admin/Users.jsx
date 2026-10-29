import { t } from "../../i18n/I18nProvider"
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Mail, ShieldAlert, ShieldCheck, UserPlus, UserX, UserCheck } from 'lucide-react'
import { get, post, put } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal, Notice, PageHeader, SearchInput, Segmented, Select, Textarea, cx } from '../../components/ui'
import { FormError } from '../auth/AuthLayout'

export const ROLE_NAMES = { ADMIN: 'Administrator', PRINCIPAL: 'Principal', MENTOR: 'Mentor / Teacher', STUDENT: 'Student', PARENT: 'Parent / Guardian', WARDEN: 'Warden' }
const STATUS_TONE = { ACTIVE: 'green', INVITED: 'gold', DISABLED: 'neutral' }
const STATUS_LABEL = { ACTIVE: 'Active', INVITED: 'Invited', DISABLED: 'Deactivated' }

export default function Users() {
  const { user: me } = useAuth()
  const canManage = me.roles.includes('ADMIN')
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [handover, setHandover] = useState(null)

  const load = useCallback(() => {
    const q = new URLSearchParams({ pageSize: '100', ...(search ? { search } : {}), ...(role ? { role } : {}) })
    return get(`/admin/users?${q}`).then((d) => { setData(d); setError('') }, (e) => setError(e.message))
  }, [search, role])
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id) }, [load])

  // Sensitive calls go through run(), which asks for the password when the server requires it.
  const act = (fn, success) => run(fn).then((r) => { if (success) toast(t(success)); load(); return r }, (e) => { if (e.code !== 'CANCELLED') toast(e.message, { type: 'error' }); throw e })

  return (
    <div className="space-y-5">
      <PageHeader title="Users & access" subtitle="Accounts, roles and two-step verification"
        actions={canManage && <Button icon={UserPlus} onClick={() => setCreating(true)}>{t("Add account")}</Button>} />

      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or admission number" />
        <Select aria-label={t("Role")} value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles" options={Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }))} />
      </div>

      {error && <Notice tone="red">{error}</Notice>}
      <Card>
        {data === null && !error && <p className="px-5 py-6 text-[13.5px] text-ink-muted">{t("Loading…")}</p>}
        {data?.items.length === 0 && <EmptyState title="No accounts match">Try a different search or role.</EmptyState>}
        <ul className="divide-y divide-line">
          {data?.items.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setSelected(u)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-ivory-50 sm:px-5">
                <Avatar name={u.displayName} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-forest">{u.displayName}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">{u.email || u.username} · {u.roles.map((r) => t(ROLE_NAMES[r])).join(', ')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {u.mfaRecoveryPending ? <Badge tone="amber" icon={ShieldAlert}>{t("Recovery pending")}</Badge> : u.mfaEnabled && <Badge tone="green" icon={ShieldCheck}>{t("2-step on")}</Badge>}
                  <Badge tone={STATUS_TONE[u.status]}>{t(STATUS_LABEL[u.status])}</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <CreateUserModal open={creating} onClose={() => setCreating(false)}
        onCreate={(body) => act(() => post('/admin/users', body), 'Account created').then((r) => { setCreating(false); if (r.invite.delivery !== 'email') setHandover({ kind: 'invite', ...r.invite, name: r.user.displayName }) })} />
      {selected && (
        <UserModal user={selected} me={me} canManage={canManage} onClose={() => setSelected(null)} act={act}
          onHandover={(h) => { setSelected(null); setHandover(h) }} onChanged={(u) => setSelected(u)} />
      )}
      <HandoverModal handover={handover} onClose={() => setHandover(null)} />
      {dialog}
    </div>
  )
}

function CreateUserModal({ open, onClose, onCreate }) {
  const blank = { displayName: '', email: '', username: '', phone: '', roles: ['PARENT'] }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF(blank); setErrors({}) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const toggleRole = (r) => setF((x) => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter((y) => y !== r) : [...x.roles, r] }))
  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (f.displayName.trim().length < 2) errs.displayName = 'Enter the full name.'
    if (!f.email.trim() && !f.username.trim()) errs.email = 'Give an email, or an admission number for students without email.'
    if (f.roles.length === 0) errs.roles = 'Choose at least one role.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    const body = { displayName: f.displayName.trim(), roles: f.roles, ...(f.email.trim() ? { email: f.email.trim() } : {}), ...(f.username.trim() ? { username: f.username.trim() } : {}), ...(f.phone.trim() ? { phone: f.phone.trim() } : {}) }
    try {
      await onCreate(body)
    } catch (err) {
      if (err.code !== 'CANCELLED') setErrors({ ...err.fieldErrors, form: err.code === 'VALIDATION_FAILED' ? null : err.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add account" subtitle="The person receives an invitation to choose their own password.">
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Input label={t("Full name")} value={f.displayName} onChange={set('displayName')} error={errors.displayName} required />
        <Input label={t("Email")} type="email" value={f.email} onChange={set('email')} error={errors.email} hint={t("The invitation is sent here.")} />
        <Input label={t("Admission number (students without email)")} value={f.username} onChange={set('username')} error={errors.username} />
        <Input label={t("Phone")} type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
        <div>
          <p className="label">{t("Roles")}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ROLE_NAMES).map(([r, label]) => (
              <button key={r} type="button" aria-pressed={f.roles.includes(r)} onClick={() => toggleRole(r)}
                className={cx('min-h-[40px] rounded-xl border px-3 text-[13px] font-semibold transition', f.roles.includes(r) ? 'border-primary-600 bg-primary-600 text-white' : 'border-line-strong bg-white text-ink-soft')}>{t(label)}</button>
            ))}
          </div>
          {errors.roles && <p className="mt-1 text-[12.5px] font-medium text-clay-600">{t(errors.roles)}</p>}
        </div>
        <FormError error={errors.form} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={busy} icon={UserPlus}>{t("Create and invite")}</Button>
        </div>
      </form>
    </Modal>
  )
}

function UserModal({ user, me, canManage, onClose, act, onHandover, onChanged }) {
  const [mode, setMode] = useState(null) // null | 'roles' | 'mfa'
  const [roles, setRoles] = useState(user.roles)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState(user.email && user.emailVerifiedAt ? 'EMAIL_LINK' : 'IN_PERSON')
  const [error, setError] = useState('')
  const self = user.id === me.id
  const fail = (e) => { if (e.code !== 'CANCELLED') setError(e.message) }

  const saveRoles = () => act(() => put(`/admin/users/${user.id}/roles`, { roles }), 'Roles updated').then((u) => { onChanged(u); setMode(null) }, fail)
  const setStatus = (active) => act(() => post(`/admin/users/${user.id}/status`, { active }), active ? 'Account reactivated' : 'Account deactivated').then(onChanged, fail)
  const resend = () => act(() => post(`/admin/users/${user.id}/invite`), null).then((r) => (r.delivery === 'email' ? onClose() : onHandover({ kind: 'invite', ...r, name: user.displayName })), fail)
  const resetMfa = () => {
    if (reason.trim().length < 5) return setError('Record why the reset is needed (at least 5 characters).')
    act(() => post(`/admin/users/${user.id}/mfa/reset`, { reason: reason.trim(), method }), 'Two-step verification reset').then((r) => onHandover({ kind: 'mfa', ...r, name: user.displayName }), fail)
  }

  return (
    <Modal open onClose={onClose} title={user.displayName} subtitle={`${user.email || user.username} · ${user.roles.map((r) => t(ROLE_NAMES[r])).join(', ')}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[user.status]}>{t(STATUS_LABEL[user.status])}</Badge>
          <Badge tone={user.mfaEnabled ? 'green' : 'neutral'}>{user.mfaEnabled ? t('Two-step verification on') : t('Two-step verification off')}</Badge>
          {user.mfaRecoveryPending && <Badge tone="amber">{t("Waiting for the user to finish recovery")}</Badge>}
        </div>
        {error && <FormError error={error} />}

        {!canManage && <p className="text-[13.5px] text-ink-muted">{t("You can view accounts. Only administrators can change them.")}</p>}

        {canManage && mode === null && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => { setMode('roles'); setError('') }}>{t("Change roles")}</Button>
            {user.status === 'INVITED' && <Button variant="secondary" icon={Mail} onClick={resend}>{t("Send invitation again")}</Button>}
            {!self && user.status !== 'INVITED' && <Button variant="secondary" icon={KeyRound} onClick={() => { setMode('mfa'); setError('') }}>{t("Reset two-step verification")}</Button>}
            {!self && (user.status === 'DISABLED'
              ? <Button variant="secondary" icon={UserCheck} onClick={() => setStatus(true)}>{t("Reactivate")}</Button>
              : <Button variant="danger-soft" icon={UserX} onClick={() => setStatus(false)}>{t("Deactivate")}</Button>)}
          </div>
        )}

        {mode === 'roles' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ROLE_NAMES).map(([r, label]) => (
                <button key={r} type="button" aria-pressed={roles.includes(r)} onClick={() => setRoles((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
                  className={cx('min-h-[40px] rounded-xl border px-3 text-[13px] font-semibold transition', roles.includes(r) ? 'border-primary-600 bg-primary-600 text-white' : 'border-line-strong bg-white text-ink-soft')}>{t(label)}</button>
              ))}
            </div>
            <p className="text-[12.5px] text-ink-muted">{t("The user is signed out so the new role's rules apply at their next sign-in.")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode(null)}>{t("Back")}</Button>
              <Button disabled={roles.length === 0} onClick={saveRoles}>{t("Save roles")}</Button>
            </div>
          </div>
        )}

        {mode === 'mfa' && (
          <div className="space-y-3">
            <Notice tone="gold" icon={ShieldAlert}>{t("Use this when the user has lost their phone. Their current authenticator and every signed-in device stop working immediately. They then set up a new phone after proving it is them.")}</Notice>
            <Textarea label={t("Reason (kept in the activity log)")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Phone lost; identity confirmed by phone call to registered number")} />
            <div>
              <p className="label">{t("How will the user prove it is them?")}</p>
              <Segmented value={method} onChange={setMethod} label="Recovery method" options={[
                { value: 'EMAIL_LINK', label: t('Link to verified email'), disabled: !(user.email && user.emailVerifiedAt) },
                { value: 'IN_PERSON', label: t('In person at the office') },
              ].filter((o) => !o.disabled)} />
              <p className="mt-1.5 text-[12.5px] text-ink-muted">{method === 'EMAIL_LINK' ? t('A single-use link (30 minutes) goes to their verified email. They also need their password.') : t('Check their ID in person. You will get a single-use link (15 minutes) to hand to them. They also need their password.')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode(null)}>{t("Back")}</Button>
              <Button variant="danger" onClick={resetMfa}>{t("Reset now")}</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** One-time links the office hands over in person. Shown once; never stored in the page. */
function HandoverModal({ handover, onClose }) {
  if (!handover) return null
  const link = handover.kind === 'invite' ? handover.setupLink : handover.inPersonTicket && `${window.location.origin}/mfa-recovery?token=${handover.inPersonTicket}`
  const expires = handover.expiresAt || handover.ticketExpiresAt
  return (
    <Modal open onClose={onClose} size="sm" title={handover.kind === 'invite' ? 'Hand over the setup link' : 'Two-step verification reset'} subtitle={handover.name}>
      <div className="space-y-3 text-[13.5px]">
        {handover.kind === 'mfa' && (
          <p className="text-ink-soft">{t("Old authenticator revoked and {n} device(s) signed out.", { n: handover.revokedSessions })} {handover.notification === 'sent' ? t('The user has been emailed.') : handover.notification === 'failed' ? t('The email could not be sent — use the in-person procedure.') : ''}</p>
        )}
        {handover.kind === 'invite' && handover.delivery === 'email_failed' && <Notice tone="red">{t("The invitation email could not be sent. Try again later.")}</Notice>}
        {link ? (
          <>
            <Notice tone="gold">{t("Give this link only to the person, after checking their identity. It works once and expires at {time}. It will not be shown again.", { time: new Date(expires).toLocaleTimeString() })}</Notice>
            <p className="select-all break-all rounded-xl border border-line bg-white p-3 font-mono text-[12.5px]">{link}</p>
            <Button variant="secondary" className="w-full" onClick={() => navigator.clipboard?.writeText(link)}>{t("Copy link")}</Button>
          </>
        ) : handover.kind === 'mfa' && <p className="text-ink-muted">{t("The user will receive a single-use recovery link by email.")}</p>}
        <Button className="w-full" onClick={onClose}>{t("Done")}</Button>
      </div>
    </Modal>
  )
}
