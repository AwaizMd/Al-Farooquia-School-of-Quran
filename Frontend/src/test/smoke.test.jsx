import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import App from '../app/App'
import { NAV } from '../constants/navigation'
import { MADRASAS, PERSONAS, fakeFetch } from './fakeApi'

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
