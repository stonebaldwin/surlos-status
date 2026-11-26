import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkComponent } from '../src/probe.js'

const answer = (status) => ({ status, arrayBuffer: async () => new ArrayBuffer(0) })
const component = (probes) => ({ id: 'api', probes })
const fast = { retryDelayMs: 0 }

test('up when every probe answers an expected status; redirects are not followed', async () => {
  const seen = []
  const fetchImpl = async (url, init) => (seen.push([url, init.redirect]), answer(url.endsWith('/a') ? 200 : 401))
  const result = await checkComponent(component([{ url: 'https://x.test/a', expect: [200] }, { url: 'https://x.test/b', expect: [401] }]), { fetchImpl, ...fast })
  assert.equal(result.ok, true)
  assert.equal(result.detail, 'ok')
  assert.ok(Number.isInteger(result.ms) && result.ms >= 0) // the slowest probe's response time
  assert.deepEqual(seen, [['https://x.test/a', 'manual'], ['https://x.test/b', 'manual']])
})

test('an unexpected status is down, after one retry, and says what it saw', async () => {
  let calls = 0
  const fetchImpl = async () => (calls++, answer(503))
  const result = await checkComponent(component([{ url: 'https://x.test/a', expect: [200] }]), { fetchImpl, ...fast })
  assert.equal(result.ok, false)
  assert.equal(result.detail, 'https://x.test/a answered 503, expected 200')
  assert.equal(calls, 2)
})

test('one failure followed by a success is up', async () => {
  let calls = 0
  const fetchImpl = async () => (calls++ === 0 ? Promise.reject(new Error('socket hang up')) : answer(200))
  assert.equal((await checkComponent(component([{ url: 'https://x.test/a', expect: [200] }]), { fetchImpl, ...fast })).ok, true)
})

test('a network error is down and names the reason', async () => {
  const fetchImpl = async () => Promise.reject(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))
  const result = await checkComponent(component([{ url: 'https://x.test/a', expect: [200] }]), { fetchImpl, ...fast })
  assert.deepEqual(result, { ok: false, ms: null, detail: 'https://x.test/a: ENOTFOUND' })
})

test('sends the probe headers and a user agent that names the checker', async () => {
  let headers
  const fetchImpl = async (_url, init) => ((headers = init.headers), answer(401))
  await checkComponent(component([{ url: 'https://x.test/a', expect: [401], headers: { Authorization: 'Bearer sk_test_x' } }]), { fetchImpl, ...fast })
  assert.equal(headers.Authorization, 'Bearer sk_test_x')
  assert.match(headers['User-Agent'], /^surlos-status\//)
})
