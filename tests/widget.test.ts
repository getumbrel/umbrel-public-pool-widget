import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const stats = { totalHashRate: 968e9, totalMiners: 3, blocksFound: [{ height: 883452 }], blockHeight: 883453 }
const titles = ['Hash Rate', 'Miners', 'Blocks Found', 'Block Height']
const fallback = { type: 'four-stats', refresh: '5s', items: titles.map(title => ({ title, text: '-' })) }
let payload: unknown = stats
let upstreamStatus = 200
let invalidJson = false
let requests = 0
const upstream = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch() {
    requests++
    return invalidJson ? new Response('not json') : Response.json(payload, { status: upstreamStatus })
  },
})
const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
const port = reservation.port!
reservation.stop(true)
const url = `http://127.0.0.1:${port}`
const entrypoint = join(import.meta.dir, '..', 'index.ts')
const command = process.env.WIDGET_BINARY ? [process.env.WIDGET_BINARY] : [process.execPath, entrypoint]
const childEnv = { ...process.env }
if (process.env.WIDGET_BINARY) delete childEnv.BUN_BE_BUN
const child = Bun.spawn(command, {
  env: { ...childEnv, PORT: String(port), PUBLIC_POOL_API_URL: `${upstream.url}api/pool` },
  stdout: 'ignore', stderr: 'ignore',
})

beforeAll(async () => {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${url}/ready`); return } catch { await Bun.sleep(20) }
  }
  throw new Error('Widget did not start')
})

afterAll(async () => { child.kill(); await child.exited; upstream.stop(true) })

async function widget(value: unknown = stats, path = '/widgets/pool') {
  payload = value
  upstreamStatus = 200
  invalidJson = false
  const response = await fetch(`${url}${path}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/json')
  return response.json() as Promise<{ type: string; refresh: string; items: Array<{ title: string; text: string; subtext?: string }> }>
}

describe('widget HTTP responses', () => {
  test('preserves the four stats, labels and string values', async () => {
    expect(await widget()).toEqual({
      type: 'four-stats', refresh: '5s', items: [
        { title: 'Hash Rate', text: '968.00', subtext: 'GH/s' },
        { title: 'Miners', text: '3' },
        { title: 'Blocks Found', text: '1' },
        { title: 'Block Height', text: '883453' },
      ],
    })
  })

  for (const [rate, text, unit] of [
    [0, '0.00', 'H/s'], [999, '999.00', 'H/s'], [1e3, '1.00', 'KH/s'],
    [1e6, '1.00', 'MH/s'], [1e9, '1.00', 'GH/s'], [1.234e12, '1.23', 'TH/s'],
    [1e15, '1.00', 'PH/s'], [1e18, '1.00', 'EH/s'], [1e21, '1000.00', 'EH/s'],
  ] as const) {
    test(`formats ${rate} H/s`, async () => {
      const result = await widget({ ...stats, totalHashRate: rate })
      expect(result.items[0]).toEqual({ title: 'Hash Rate', text, subtext: unit })
    })
  }

  test('preserves zero miners and blocks', async () => {
    const result = await widget({ ...stats, totalMiners: 0, blocksFound: [], blockHeight: 0 })
    expect(result.items.slice(1).map(item => item.text)).toEqual(['0', '0', '0'])
  })

  test('accepts query strings on the widget endpoint', async () => {
    expect((await widget(stats, '/widgets/pool?refresh=1')).type).toBe('four-stats')
  })

  test('unknown paths return 404 without calling upstream', async () => {
    const before = requests
    const response = await fetch(`${url}/other`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Invalid endpoint. Please use /widgets/pool' })
    expect(requests).toBe(before)
  })

  for (const value of [null, {}, { error: 'Unavailable' }, { ...stats, blocksFound: null }]) {
    test(`uses labeled placeholders for incomplete data ${JSON.stringify(value)}`, async () => {
      expect(await widget(value)).toEqual(fallback)
    })
  }

  test('uses labeled placeholders for malformed JSON', async () => {
    invalidJson = true
    expect(await (await fetch(`${url}/widgets/pool`)).json()).toEqual(fallback)
    invalidJson = false
  })

  test('uses labeled placeholders for an upstream error response', async () => {
    upstreamStatus = 503
    payload = { error: 'Unavailable' }
    expect(await (await fetch(`${url}/widgets/pool`)).json()).toEqual(fallback)
    upstreamStatus = 200
  })

  test('fails startup when the upstream URL is missing', async () => {
    const env = { ...childEnv }
    delete env.PUBLIC_POOL_API_URL
    const missing = Bun.spawn(command, { env, stdout: 'ignore', stderr: 'pipe' })
    const stderr = await new Response(missing.stderr).text()
    expect(await missing.exited).not.toBe(0)
    expect(stderr).toContain('PUBLIC_POOL_API_URL environment variable is not set')
  })

  test('uses labeled placeholders when upstream is offline', async () => {
    upstream.stop(true)
    expect(await (await fetch(`${url}/widgets/pool`)).json()).toEqual(fallback)
  })
})
