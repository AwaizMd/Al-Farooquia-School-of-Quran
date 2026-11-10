'use client'

import { useRef, useState, type FormEvent } from 'react'
import type { FormField, FormType } from '../lib/api'
import { dict, href, type Lang } from '../lib/i18n'

export interface Choice { id: string; label: string }

const inputMode = (t: FormField['type']) => (t === 'tel' ? 'tel' : t === 'number' ? 'numeric' : t === 'email' ? 'email' : undefined)
const autoComplete = (key: string) => ({ address: 'street-address', dob: 'bday' } as Record<string, string>)[key]

/** Mobile-first: one column and the right keyboard. The server checks everything again. */
export function RegistrationForm({ type, lang, fields, instructions, allowDocuments, consentText, formToken, choices, chosen, choiceLabel, nameLabel }: {
  type: FormType; lang: Lang; fields: FormField[]; instructions: string; allowDocuments: boolean; consentText: string; formToken: string; choices?: Choice[]; chosen?: string | undefined; choiceLabel?: string; nameLabel: string
}) {
  const t = dict(lang)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState('')
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const top = useRef<HTMLDivElement>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const fd = new FormData(e.currentTarget)
    const value = (k: string) => String(fd.get(k) ?? '').trim()
    const answers = Object.fromEntries(fields.map((f) => [f.key, value(`a_${f.key}`)]).filter(([, v]) => v))
    const choice = value('choice')
    const payload = {
      type, applicantName: value('applicantName'), phone: value('phone'), email: value('email'), answers, consent: fd.get('consent') === 'on', formToken, website: value('website'),
      ...(type === 'HALAQA' && choice ? { halaqaId: choice } : {}), ...((type === 'EVENT' || type === 'ADMISSION') && choice ? { siteItemId: choice } : {}),
    }
    const body = new FormData()
    body.set('payload', JSON.stringify(payload))
    for (const f of fd.getAll('files')) if (f instanceof File && f.size) body.append('files', f)
    setBusy(true); setErrors({}); setAlert('')
    try {
      const r = await fetch('/api/apply', { method: 'POST', body })
      const data = await r.json().catch(() => null)
      if (r.ok) { setReference(data.reference); window.scrollTo({ top: 0 }); return }
      const details = data?.error?.details
      if (Array.isArray(details)) {
        setErrors(Object.fromEntries(details.map((d: { path: string; message: string }) => [String(d.path).replace(/^answers\./, ''), d.message])))
        setAlert(t.fixFields)
      } else setAlert(data?.error?.message || t.tryAgain)
      top.current?.scrollIntoView({ block: 'center' })
    } catch {
      // Nothing is cleared: the person can simply press Send again.
      setAlert(t.offline)
    } finally {
      setBusy(false)
    }
  }

  if (reference) {
    return (
      <div className="success" role="status">
        <h2>{t.received}</h2>
        <p style={{ margin: '12px 0 0' }}>{t.referenceIs}</p>
        <strong className="ref">{reference}</strong>
        <p>{t.keepRef}</p>
        <a href={href(lang, '/application/status')}>{t.checkStatus}</a>
      </div>
    )
  }
  const err = (k: string) => (errors[k] ? <p className="field-error" id={`${k}-err`}>{errors[k]}</p> : null)
  const a = (k: string) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } as const : {})
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div ref={top} aria-live="polite">{alert && <p className="alert">{alert}</p>}</div>
      {instructions && <p className="hint" style={{ fontSize: '1rem' }}>{instructions}</p>}
      <div className="hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="field"><label htmlFor="applicantName">{nameLabel}</label><input id="applicantName" name="applicantName" autoComplete="name" required maxLength={120} {...a('applicantName')} />{err('applicantName')}</div>
      {choices && (
        <div className="field">
          <label htmlFor="choice">{choiceLabel}</label>
          <select id="choice" name="choice" defaultValue={chosen ?? ''} {...a(type === 'HALAQA' ? 'halaqaId' : 'siteItemId')}><option value="">{t.choose}</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          {err(type === 'HALAQA' ? 'halaqaId' : 'siteItemId')}
        </div>
      )}
      <div className="field"><label htmlFor="phone">{t.yourPhone}</label><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={20} {...a('phone')} />{err('phone')}</div>
      <div className="field"><label htmlFor="email">{t.yourEmail}</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={254} {...a('email')} />{err('email')}<p className="hint">{t.contactHint}</p></div>
      {fields.map((f) => {
        const id = `a_${f.key}`
        const label = <label htmlFor={id}>{f.label}{!f.required && <span className="opt"> ({t.optional})</span>}</label>
        return (
          <div className="field" key={f.key}>
            {label}
            {f.type === 'textarea' ? <textarea id={id} name={id} required={f.required} maxLength={3000} {...a(f.key)} />
              : f.type === 'select' ? <select id={id} name={id} required={f.required} {...a(f.key)}><option value="">{t.choose}</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
              : <input id={id} name={id} type={f.type === 'number' ? 'text' : f.type} inputMode={inputMode(f.type)} autoComplete={autoComplete(f.key)} required={f.required} maxLength={300} {...a(f.key)} />}
            {err(f.key)}
          </div>
        )
      })}
      {allowDocuments && <div className="field"><label htmlFor="files">{t.documents} <span className="opt">({t.optional})</span></label><input id="files" name="files" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" /><p className="hint">{t.documentsHint}</p></div>}
      <div className="field"><label className="check"><input type="checkbox" name="consent" {...a('consent')} /><span>{consentText}</span></label>{err('consent')}{<p className="hint"><a href={href(lang, '/privacy')}>{t.privacy}</a></p>}</div>
      <div><button className="btn" disabled={busy}>{busy ? t.sending : t.send}</button></div>
    </form>
  )
}

export function StatusForm({ lang }: { lang: Lang }) {
  const t = dict(lang)
  const [result, setResult] = useState<{ status: string; receivedOn: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: fd.get('reference'), contact: fd.get('contact') }) })
      if (r.ok) setResult(await r.json())
      else setError(r.status === 404 || r.status === 422 ? t.statusNotFound : t.tryAgain)
    } catch { setError(t.offline) } finally { setBusy(false) }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="reference">{t.reference}</label><input id="reference" name="reference" required maxLength={30} dir="ltr" autoCapitalize="characters" autoComplete="off" /></div>
      <div className="field"><label htmlFor="contact">{t.contactUsed}</label><input id="contact" name="contact" required maxLength={254} dir="ltr" /></div>
      <div><button className="btn" disabled={busy}>{busy ? t.sending : t.check}</button></div>
      <div aria-live="polite">
        {error && <p className="alert">{error}</p>}
        {result && <div className="success"><h2>{t[`status_${result.status}` as 'status_PENDING']}</h2><p style={{ margin: '8px 0 0' }}>{t.receivedOn}: {result.receivedOn}</p></div>}
      </div>
    </form>
  )
}

export function RespondForm({ lang, token }: { lang: Lang; token: string }) {
  const t = dict(lang)
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body = new FormData()
    body.set('payload', JSON.stringify({ token, message: String(fd.get('message') ?? '').trim() }))
    for (const f of fd.getAll('files')) if (f instanceof File && f.size) body.append('files', f)
    setState('busy'); setError('')
    try {
      const r = await fetch('/api/respond', { method: 'POST', body })
      if (r.ok) return setState('done')
      setError(r.status === 404 ? t.linkInvalid : ((await r.json().catch(() => null))?.error?.message ?? t.tryAgain))
    } catch { setError(t.offline) }
    setState('idle')
  }
  if (state === 'done') return <div className="success" role="status"><p style={{ margin: 0 }}>{t.replySent}</p></div>
  return (
    <form className="form" onSubmit={submit}>
      {error && <p className="alert">{error}</p>}
      <div className="field"><label htmlFor="message">{t.yourReply}</label><textarea id="message" name="message" required maxLength={3000} /></div>
      <div className="field"><label htmlFor="files">{t.documents} <span className="opt">({t.optional})</span></label><input id="files" name="files" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" /><p className="hint">{t.documentsHint}</p></div>
      <div><button className="btn" disabled={state === 'busy'}>{state === 'busy' ? t.sending : t.send}</button></div>
    </form>
  )
}
