import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A local stand-in for Razorpay's REST API (orders, payments, refunds) so the
 * Razorpay adapter can be tested without credentials or network. It checks
 * Basic auth like Razorpay does and lets tests decide what a payment looks like.
 */
export async function fakeRazorpay(keyId: string, keySecret: string) {
  const state = {
    orders: new Map<string, { amount: number; currency: string }>(),
    payments: new Map<string, { id: string; order_id: string; status: string; amount: number; currency: string }>(),
    calls: [] as string[],
  }
  let n = 0
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: object) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    state.calls.push(`${req.method} ${req.url}`)
    if (req.headers.authorization !== `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`) return send(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } })
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {}
      const url = req.url ?? ''
      if (req.method === 'GET' && url.startsWith('/v1/orders')) return send(200, { entity: 'collection', count: 0, items: [] })
      if (req.method === 'POST' && url === '/v1/orders') {
        const id = `order_fake${++n}`
        state.orders.set(id, { amount: body.amount, currency: body.currency })
        return send(200, { id, entity: 'order', amount: body.amount, currency: body.currency, status: 'created' })
      }
      const pay = /^\/v1\/payments\/([^/]+)(\/refund)?$/.exec(url)
      if (pay) {
        const p = state.payments.get(decodeURIComponent(pay[1]!))
        if (!p) return send(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } })
        if (pay[2]) return send(200, { id: `rfnd_fake${++n}`, entity: 'refund', amount: body.amount, status: 'processed' })
        return send(200, { entity: 'payment', ...p })
      }
      send(404, { error: { code: 'NOT_FOUND' } })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return { base, state, close: () => new Promise<void>((r) => server.close(() => r())) }
}
