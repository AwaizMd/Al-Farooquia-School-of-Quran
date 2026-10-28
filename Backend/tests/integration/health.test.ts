import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const app = createApp()

describe('health and platform behaviour', () => {
  it('reports liveness', async () => {
    const res = await request(app).get('/api/v1/health/live')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('reports readiness when the database is reachable', async () => {
    const res = await request(app).get('/api/v1/health/ready')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns a consistent JSON error for unknown endpoints', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('rejects malformed JSON without leaking parser details', async () => {
    const res = await request(app).post('/api/v1/health/live').set('Content-Type', 'application/json').send('{"bad"')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: 'BAD_JSON', message: 'The request body is not valid JSON.' })
  })

  it('rejects oversized bodies', async () => {
    const res = await request(app).post('/api/v1/health/live').set('Content-Type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(200_000) }))
    expect(res.status).toBe(413)
  })

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health/live')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBeTruthy()
  })

  it('only grants CORS to configured origins', async () => {
    const ok = await request(app).get('/api/v1/health/live').set('Origin', 'http://localhost:5173')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const bad = await request(app).get('/api/v1/health/live').set('Origin', 'https://evil.example')
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})
