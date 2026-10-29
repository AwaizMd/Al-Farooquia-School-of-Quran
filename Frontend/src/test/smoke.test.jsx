import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import App from '../app/App'
import { NAV } from '../constants/navigation'
import { PERSONAS, fakeFetch } from './fakeApi'

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
