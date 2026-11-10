import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import App from '../app/App'
import { NAV } from '../constants/navigation'
import { MADRASAS, PERSONAS, fakeFetch } from './fakeApi'
import { money } from '../utils/format'
import { onSessionLost, post } from '../api/client'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

async function boot(persona, path = '/dashboard') {
  vi.stubGlobal('fetch', vi.fn(fakeFetch(persona)))
  window.history.pushState({}, '', path)
  const errors = []
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.map(String).join(' ')) })
  render(<App />)
  return errors
}

const pageCrashed = () => screen.queryByText('Something went wrong on this page')

describe('signed out', () => {
  it('shows the real sign-in form without demo credentials', async () => {
    await boot(null, '/dashboard')
    await screen.findByRole('button', { name: /sign in/i })
    expect(screen.queryByText(/Demo123!/)).toBeNull()
    expect(screen.getByLabelText(/email or admission number/i)).toBeTruthy()
  })
})

describe.each(Object.keys(PERSONAS))('%s', (persona) => {
  it('renders every page in its navigation without crashing', async () => {
    const errors = await boot(persona)
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    const items = NAV[persona].sections.flatMap((s) => s.items)
    for (const item of [...items, { to: '/account/security' }, { to: '/notifications' }]) {
      await act(async () => {
        window.history.pushState({}, '', item.to)
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await waitFor(() => expect(document.querySelector('main')).toBeTruthy())
      expect(pageCrashed(), `${persona} ${item.to}`).toBeNull()
      expect(screen.queryByText('Not available for this role'), `${persona} ${item.to}`).toBeNull()
    }
    expect(errors.filter((e) => /Page error|Uncaught|is not a function|Cannot read/.test(e))).toEqual([])
  })
})

describe('confirming a sensitive action', () => {
  const answer = (code) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'x' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })))

  it('a mistyped password keeps the person signed in; a really lost session does not', async () => {
    const lost = vi.fn()
    const stop = onSessionLost(lost)
    answer('REAUTH_FAILED')
    await expect(post('/auth/reauthenticate', { password: 'x' })).rejects.toMatchObject({ code: 'REAUTH_FAILED' })
    expect(lost).not.toHaveBeenCalled()
    answer('UNAUTHENTICATED')
    await expect(post('/fees/payments', {})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(lost).toHaveBeenCalledOnce()
    stop()
  })
})

describe('Halaqa programs and the public website', () => {
  it('the Principal gets applications and the Mureed directory', async () => {
    await boot('principal', '/applications')
    await screen.findByText('Seeker Person', {}, { timeout: 5000 })
    expect(screen.getByText(/Visible only to you/)).toBeTruthy()
    cleanup()
    await boot('principal', '/mureeds')
    await screen.findByText('Quiet Person', {}, { timeout: 5000 })
  })

  it('an administrator runs Halaqas and website content but never sees applications or Mureeds', async () => {
    for (const path of ['/applications', '/mureeds']) {
      cleanup()
      await boot('admin', path)
      await screen.findByText('Not available for this role', {}, { timeout: 5000 })
      expect(screen.queryByText('Seeker Person')).toBeNull()
    }
    cleanup()
    await boot('admin', '/halaqa')
    await screen.findByText('Total Halaqas', {}, { timeout: 5000 })
    expect(screen.queryByText('Mureeds')).toBeNull()
    expect(screen.queryByRole('link', { name: /applications/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /mureed directory/i })).toBeNull()
  })

  it('a mentor sees only sessions; parents get no page at all', async () => {
    await boot('mentor', '/halaqa')
    await screen.findByText('Halaqa Programs', { selector: 'h1' }, { timeout: 5000 })
    expect(screen.queryByText('Total Halaqas')).toBeNull()
    expect(screen.queryByRole('tab', { name: /participants/i })).toBeNull()
    cleanup()
    await boot('parent', '/halaqa')
    await screen.findByText('Not available for this role', {}, { timeout: 5000 })
  })
})

describe('payroll', () => {
  const click = async (name) => { const b = await screen.findByRole('button', { name }, { timeout: 5000 }); await act(async () => { b.click() }) }

  it('an administrator can open a draft, see who has no salary, and approve; every rule starts switched off', async () => {
    await boot('admin', '/payroll')
    await click(/2026-10/)
    await screen.findByText(/Hafiz Imran/)
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeTruthy()
    expect(screen.getByText(/absent days may be too high/i)).toBeTruthy()
    cleanup()
    await boot('admin', '/payroll')
    const tab = await screen.findByRole('tab', { name: /^Rules$/ }, { timeout: 5000 })
    await act(async () => { tab.click() })
    await screen.findByText('Payroll rules')
    expect(screen.getByLabelText(/each day absent/i).checked).toBe(false)
    expect(screen.getByLabelText(/repeated lateness/i).checked).toBe(false)
  })

  it('an accountant prepares but is not offered approval', async () => {
    await boot('accountant', '/payroll')
    await click(/2026-10/)
    await screen.findByRole('button', { name: /recalculate/i })
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull()
  })

  it('roles without the permission do not get the page', async () => {
    await boot('principal', '/payroll')
    await waitFor(() => expect(document.querySelector('main')).toBeTruthy())
    expect(screen.queryByText('Work out draft')).toBeNull()
  })
})

describe('money corrections', () => {
  it('shows paise only when there are any, so a summary always adds up', () => {
    expect(money(1500)).toBe('₹1,500')
    expect(money(1000.5)).toBe('₹1,000.50')
    expect(money(4498.5 + 2991.5)).toBe('₹7,490')
    expect(money(0.1 + 0.2)).toBe('₹0.30')
  })

  const profile = async (persona) => {
    await boot(persona, '/students')
    const code = PERSONAS[persona] && (await screen.findAllByRole('link', {}, { timeout: 5000 })).map((a) => a.getAttribute('href')).find((h) => /^\/students\/(?!new$)[^/]+$/.test(h || ''))
    window.history.pushState({}, '', `${code}?tab=fees`)
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByText('Corrections and refunds', {}, { timeout: 5000 })
  }

  it('an administrator can waive, void and refund, and sees the limit exact to the paisa', async () => {
    await profile('admin')
    expect(screen.getAllByRole('button', { name: /waive or correct/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^void$/i })).toHaveLength(1) // only the invoice with no activity
    expect(screen.getByText(/Hardship approved/)).toBeTruthy()
    expect(screen.getByText(/Paid twice by mistake/)).toBeTruthy()
    await act(async () => { screen.getAllByRole('button', { name: /waive or correct/i })[0].click() })
    await screen.findByText(/Up to ₹1,000\.50/)
  })

  it('an accountant records payments but cannot waive, void or refund', async () => {
    await profile('accountant')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /waive or correct/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^refund$/i })).toBeNull()
    expect(screen.getByText(/Paid twice by mistake/)).toBeTruthy() // the history is still visible
  })

  it('who may issue invoices or collect money follows the permissions', async () => {
    await boot('accountant', '/fees')
    await screen.findByRole('button', { name: /issue invoices/i }, { timeout: 5000 })
    expect(screen.getByRole('button', { name: /record payment/i })).toBeTruthy()
    cleanup()
    await boot('principal', '/fees')
    await screen.findByText('Fee management', {}, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /issue invoices/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /record payment/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^collect$/i })).toBeNull()
  })
})

describe('fee payment methods', () => {
  it('a parent sees only the methods the madrasa offers (no online gateway), with bank details to copy', async () => {
    await boot('parent', '/fees')
    await screen.findByRole('button', { name: /pay fees/i }, { timeout: 5000 })
    await act(async () => { screen.getByRole('button', { name: /pay fees/i }).click() })
    await screen.findByRole('radio', { name: /bank transfer/i })
    // Dialogs live directly in <body>, so an animated page wrapper cannot push them off-screen.
    expect(document.querySelector('[role=dialog]').parentElement).toBe(document.body)
    expect(screen.queryByRole('radio', { name: /pay online/i })).toBeNull() // CR-01: no payment gateway
    expect(screen.queryByRole('radio', { name: /upi qr/i })).toBeNull() // not offered by this madrasa
    await act(async () => { screen.getByRole('radio', { name: /bank transfer/i }).click() })
    await act(async () => { screen.getByRole('button', { name: /continue/i }).click() })
    await screen.findByText('123456789012')
    expect(screen.getByLabelText(/transaction reference/i)).toBeTruthy()
    expect(screen.getByText(/stays outstanding until the Madarsa office/i)).toBeTruthy()
  })

  it('shows reported payments as pending verification, not paid', async () => {
    await boot('parent', '/fees')
    await screen.findByText('Bank transfer & UPI payments', {}, { timeout: 5000 })
    expect(screen.getByText('Pending verification')).toBeTruthy()
  })

  it('the Principal can open Payment Verification but not approve; payment settings are admin-only', async () => {
    await boot('principal', '/payment-verification')
    await screen.findByText(/Approving or rejecting them is done by the administration/i, {}, { timeout: 5000 })
    await act(async () => { window.history.pushState({}, '', '/payment-settings'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByText('Not available for this role')
  })
})

describe('server-scoped data reaches the screens', () => {
  it('a parent only ever holds their own children', async () => {
    await boot('parent', '/dashboard')
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    expect(document.body.textContent).toContain('Abdullah')
    expect(document.body.textContent).not.toContain('Ibrahim Ansari') // another family's child
  })

  it('pages render real content after client-side navigation', async () => {
    await boot('mentor', '/dashboard')
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    await act(async () => { window.history.pushState({}, '', '/students'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findAllByText('Abdullah Khan')
    expect(document.body.textContent).not.toContain('Maryam Khan') // another halqa
  })

  it('a warden lands on the hostel and cannot open student profiles', async () => {
    await boot('warden', '/students')
    await screen.findByText('Not available for this role', {}, { timeout: 5000 })
  })

  it('the principal does not get admission or settings controls', async () => {
    await boot('principal', '/students')
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryByRole('link', { name: /add student/i })).toBeNull()
    await act(async () => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByText('Not available for this role')
  })
})

describe('CR-01: madrasas, roles and removed modules', () => {
  it('the digital library is gone from every menu and route', async () => {
    for (const persona of Object.keys(NAV)) {
      expect(JSON.stringify(NAV[persona]), persona).not.toMatch(/library/i)
    }
    await boot('student', '/library')
    await waitFor(() => expect(document.querySelector('main')).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryByText(/digital library/i)).toBeNull()
  })

  it('someone working in two madrasas can switch, and every request then names the chosen madrasa', async () => {
    await boot('admin', '/dashboard')
    const select = await screen.findAllByRole('combobox').then((all) => all.find((s) => [...s.options].some((o) => o.text === 'Girls Campus')))
    expect(select).toBeTruthy()
    await act(async () => { select.value = MADRASAS[1].id; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await waitFor(() => {
      const calls = fetch.mock.calls.filter(([, init]) => init?.headers?.['X-Madrasa-Id'] === MADRASAS[1].id)
      expect(calls.length).toBeGreaterThan(0)
    })
  })

  it('the madrasa switcher is not shown to someone in only one madrasa', async () => {
    await boot('mentor', '/dashboard')
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryAllByRole('combobox').filter((s) => [...s.options].some((o) => o.text === 'Girls Campus'))).toEqual([])
  })

  it('only a Super Admin sees the Madrasas page', async () => {
    await boot('admin', '/organization')
    await screen.findByText('Girls Campus', {}, { timeout: 5000 })
    cleanup()
    await boot('principal', '/organization')
    await screen.findByText('Not available for this role', {}, { timeout: 5000 })
  })

  it('the Chartered Accountant and the Committee get their own read-only views', async () => {
    await boot('ca', '/dashboard')
    await waitFor(() => expect(document.querySelector('nav[aria-label="Main"]')).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryByRole('link', { name: /record sabaq|users & access|settings/i })).toBeNull()
    cleanup()
    await boot('committee', '/dashboard')
    await screen.findByText(/Performance dashboards/i, {}, { timeout: 5000 })
  })
})

describe('staff attendance and kiosks', () => {
  it('a mentor gets their own QR page, with the code from the server', async () => {
    await boot('mentor', '/my-attendance')
    const img = await screen.findByAltText('Your attendance QR code', {}, { timeout: 5000 })
    expect(img.getAttribute('src')).toMatch(/^data:image/)
    await screen.findByText(/New code in \d+ seconds/)
  })

  it('administrators manage kiosks; a principal reads attendance but cannot open kiosks', async () => {
    await boot('admin', '/kiosks')
    await screen.findByRole('heading', { name: 'Main Gate' }, { timeout: 5000 })
    expect(screen.getByRole('button', { name: /add kiosk/i })).toBeTruthy()
    cleanup()
    await boot('principal', '/kiosks')
    await screen.findByText('Not available for this role', {}, { timeout: 5000 })
    await act(async () => { window.history.pushState({}, '', '/staff-attendance'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByText('Qari Abdul Rahman Siddiqui', {}, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /^correct$/i })).toBeNull() // read-only
  })

  it('the menu links to the QR page only for someone with a staff record', async () => {
    const { visibleItems } = await import('../constants/navigation')
    const item = [{ to: '/my-attendance', staffOnly: true }]
    const auth = (staff) => ({ feature: () => true, can: () => true, user: { links: staff ? { staff: { code: 'm1' } } : {} } })
    expect(visibleItems(item, auth(true))).toHaveLength(1)
    expect(visibleItems(item, auth(false))).toHaveLength(0)
  })
})

describe('recording a lesson', () => {
  it('asks for the Para and the safah, not an ayah range', async () => {
    await boot('mentor', '/sabaq/new?student=S-1001')
    await screen.findByLabelText('Amount (safah)', {}, { timeout: 5000 })
    expect(screen.getByLabelText('Para')).toBeTruthy()
    expect(screen.queryByLabelText(/from ayah/i)).toBeNull()
    expect(screen.queryByLabelText('Surah')).toBeNull()
    expect(screen.getByRole('button', { name: '1.5' })).toBeTruthy()
  })
})

describe('one-time links', () => {
  it('an invitation link still works when the page reads its token twice (StrictMode)', async () => {
    const { takeUrlToken } = await import('../api/client')
    window.history.pushState({}, '', '/accept-invite?token=abc123token456def789ghi')
    expect(takeUrlToken()).toBe('abc123token456def789ghi')
    expect(window.location.search).toBe('') // removed from the address bar
    expect(takeUrlToken()).toBe('abc123token456def789ghi')
    window.history.pushState({}, '', '/reset-password')
    expect(takeUrlToken()).toBeNull() // not carried over to another page
  })
})
