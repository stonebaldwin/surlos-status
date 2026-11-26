import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayLevel, dayUptime, emptyHistory, lastDays, overall, record, responseTime, transitions, uptime, worse } from '../src/history.js'

const NOW = new Date('2026-11-26T12:00:00Z')

test('lastDays ends today (UTC), oldest first, across a month boundary', () => {
  assert.deepEqual(lastDays(new Date('2026-12-01T00:30:00Z'), 3), ['2026-11-29', '2026-11-30', '2026-12-01'])
})

test('record counts checks and failures per day and keeps the latest round', () => {
  let history = record(emptyHistory(), { api: { ok: true, ms: 100, detail: 'ok' }, web: { ok: false, ms: null, detail: 'answered 500' } }, NOW)
  history = record(history, { api: { ok: true, ms: 140, detail: 'ok' }, web: { ok: true, ms: 80, detail: 'ok' } }, new Date('2026-11-26T12:05:00Z'))
  assert.deepEqual(history.components.api.days['2026-11-26'], { checks: 2, failures: 0, ms: 240, timed: 2 })
  // A failed check has no response time: it counts as a failure and is left out of the average.
  assert.deepEqual(history.components.web.days['2026-11-26'], { checks: 2, failures: 1, ms: 80, timed: 1 })
  assert.equal(history.latest.checkedAt, '2026-11-26T12:05:00.000Z')
  assert.equal(history.latest.components.web.ok, true)
})

test('record drops days older than it keeps', () => {
  const old = { version: 1, components: { api: { days: { '2020-01-01': { checks: 5, failures: 0 } } } }, latest: { checkedAt: null, components: {} } }
  const history = record(old, { api: { ok: true, detail: 'ok' } }, NOW, 30)
  assert.deepEqual(Object.keys(history.components.api.days), ['2026-11-26'])
})

test('dayLevel: no data, clean, a few failures, mostly failures', () => {
  assert.equal(dayLevel(undefined), 'nodata')
  assert.equal(dayLevel({ checks: 288, failures: 0 }), 'operational')
  assert.equal(dayLevel({ checks: 288, failures: 3 }), 'degraded')
  assert.equal(dayLevel({ checks: 288, failures: 144 }), 'outage')
})

test('uptime is floored to two decimals and null without data', () => {
  const days = { a: { checks: 100_000, failures: 1 }, b: { checks: 100, failures: 0 } }
  assert.equal(uptime(days, ['a', 'b']), '99.99') // never rounds a window with a failure up to 100.00
  assert.equal(uptime({ b: { checks: 100, failures: 0 } }, ['b']), '100.00')
  assert.equal(uptime({}, ['a']), null)
})

test('record adds to a day written before response times were kept', () => {
  const old = { version: 1, components: { api: { days: { '2026-11-26': { checks: 5, failures: 1 } } } }, latest: { checkedAt: null, components: {} } }
  const history = record(old, { api: { ok: true, ms: 90, detail: 'ok' } }, NOW)
  assert.deepEqual(history.components.api.days['2026-11-26'], { checks: 6, failures: 1, ms: 90, timed: 1 })
})

test('responseTime averages the timed checks and is null without any', () => {
  const days = { a: { checks: 2, failures: 0, ms: 300, timed: 2 }, b: { checks: 3, failures: 2, ms: 90, timed: 1 }, old: { checks: 4, failures: 0 } }
  assert.equal(responseTime(days, ['a', 'b', 'old']), 130)
  assert.equal(responseTime(days, ['old']), null)
})

test('dayUptime is the share of a day that passed, floored', () => {
  assert.equal(dayUptime({ checks: 288, failures: 1 }), '99.65')
  assert.equal(dayUptime({ checks: 288, failures: 0 }), '100.00')
  assert.equal(dayUptime(undefined), null)
})

test('worse picks the more serious level', () => {
  assert.equal(worse('operational', 'maintenance'), 'maintenance')
  assert.equal(worse('outage', 'degraded'), 'outage')
  assert.equal(worse('nodata', 'operational'), 'operational')
})

test('overall: operational, partial, major, waiting, and an open incident wins', () => {
  const list = [{ id: 'api', name: 'API' }, { id: 'web', name: 'Website' }]
  const latest = (api, web) => ({ checkedAt: NOW.toISOString(), components: { api: { ok: api }, web: { ok: web } } })
  assert.equal(overall(latest(true, true), list).level, 'operational')
  assert.deepEqual(overall(latest(false, true), list), { level: 'degraded', title: 'Partial outage', text: 'Our checks are failing for API.' })
  assert.equal(overall(latest(false, false), list).level, 'outage')
  assert.equal(overall({ checkedAt: null, components: {} }, list).level, 'nodata')
  const incident = { impact: 'maintenance', title: 'Database maintenance', updates: [{ text: 'Started.' }] }
  assert.deepEqual(overall(latest(true, true), list, [incident]), { level: 'maintenance', title: 'Database maintenance', text: 'Started.' })
})

test('transitions: only a change is reported, and a new component is not an alarm', () => {
  const previous = { checkedAt: NOW.toISOString(), components: { api: { ok: true }, web: { ok: false }, docs: { ok: true } } }
  const results = { api: { ok: false }, web: { ok: true }, docs: { ok: true }, dashboard: { ok: false } }
  assert.deepEqual(transitions(previous, results), { down: ['api'], recovered: ['web'] })
  assert.deepEqual(transitions({ checkedAt: null, components: {} }, results), { down: [], recovered: [] })
  // Still down on the next round: nothing new to report.
  assert.deepEqual(transitions({ components: { api: { ok: false } } }, { api: { ok: false } }), { down: [], recovered: [] })
})
