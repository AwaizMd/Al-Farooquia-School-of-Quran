import { t } from "../../i18n/I18nProvider"
import { useCallback, useRef, useState } from 'react'
import { post } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Button, Input, Modal } from '../ui'
import { CodeInput, FormError } from '../../pages/auth/AuthLayout'

/**
 * Wraps sensitive API calls. When the server answers REAUTH_REQUIRED, asks for
 * the password (and authenticator code if MFA is on), then retries once.
 *   const { run, dialog } = useSensitiveAction()
 *   run(() => post('/admin/users', body))
 */
export function useSensitiveAction() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const pending = useRef(null)

  const run = useCallback((fn) => fn().catch((err) => {
    if (err.code !== 'REAUTH_REQUIRED') throw err
    return new Promise((resolve, reject) => {
      pending.current = { fn, resolve, reject }
      setOpen(true)
    })
  }), [])

  const close = () => {
    setOpen(false)
    pending.current?.reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }))
    pending.current = null
  }

  const confirmed = () => {
    const p = pending.current
    pending.current = null
    setOpen(false)
    p.fn().then(p.resolve, p.reject)
  }

  const dialog = <ReauthDialog open={open} needsCode={!!user?.mfa?.enabled} onClose={close} onConfirmed={confirmed} />
  return { run, dialog }
}

function ReauthDialog({ open, needsCode, onClose, onConfirmed }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post('/auth/reauthenticate', { password, ...(needsCode ? { code } : {}) })
      setPassword('')
      setCode('')
      onConfirmed()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Confirm it's you" subtitle="This is a sensitive action. Confirm your password to continue.">
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Input label={t("Password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {needsCode && <CodeInput value={code} onChange={setCode} autoFocus={false} />}
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={busy}>{t("Confirm")}</Button>
        </div>
      </form>
    </Modal>
  )
}
