import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addUpdate, incidentDays, newIncident, parseIncident, sortIncidents } from '../src/incidents.js'

const FILE = `---
title: API errors on sign-in
impact: degraded
components: api, dashboard
started: 2026-11-26T20:05:00Z
resolved: 2026-11-27T01:10:00Z
---
## 2026-11-27T01:10:00Z Resolved
A bad deploy was rolled back.

## 2026-11-26T20:05:00Z Investigating
Sign-in requests are failing.
`

test('parses the front matter and the updates, oldest update first', () => {
  const incident = parseIncident(FILE, '2026-11-26-sign-in.md')
  assert.equal(incident.id, '2026-11-26-sign-in')
  assert.equal(incident.title, 'API errors on sign-in')
  assert.deepEqual(incident.components, ['api', 'dashboard'])
  assert.equal(incident.resolved, '2026-11-27T01:10:00.000Z')
  assert.deepEqual(incident.updates.map((u) => u.label), ['Investigating', 'Resolved'])
  assert.equal(incident.updates[1].text, 'A bad deploy was rolled back.')
})

test('an open incident has no resolved time and runs to now', () => {
  const open = parseIncident(FILE.replace(/resolved:.*\n/, ''), 'open.md')
  assert.equal(open.resolved, null)
  assert.deepEqual(incidentDays(open, new Date('2026-11-28T09:00:00Z')), ['2026-11-26', '2026-11-27', '2026-11-28'])
})

test('a resolved incident covers each day from start to end', () => {
  assert.deepEqual(incidentDays(parseIncident(FILE, 'x.md'), new Date('2026-12-05T00:00:00Z')), ['2026-11-26', '2026-11-27'])
})

test('a mistake in a file fails with the file name', () => {
  assert.throws(() => parseIncident('no front matter', 'bad.md'), /bad\.md: no front matter/)
  assert.throws(() => parseIncident(FILE.replace('degraded', 'catastrophe'), 'bad.md'), /bad\.md: "impact" must be one of/)
  assert.throws(() => parseIncident(FILE.replace('2026-11-26T20:05:00Z\nresolved', 'yesterday\nresolved'), 'bad.md'), /bad\.md: "started" is not a date/)
  assert.throws(() => parseIncident(FILE.replace(/title:.*\n/, ''), 'bad.md'), /bad\.md: "title" is required/)
})

test('sortIncidents is newest first', () => {
  const a = parseIncident(FILE, 'a.md')
  const b = parseIncident(FILE.replace('2026-11-26T20:05:00Z\nresolved', '2026-11-20T00:00:00Z\nresolved'), 'b.md')
  assert.deepEqual(sortIncidents([b, a]).map((i) => i.id), ['a', 'b'])
})

const AT = new Date('2026-11-26T20:05:42Z')

test('newIncident writes a file the parser reads back', () => {
  const { name, text } = newIncident({ title: 'API errors on sign-in!', impact: 'degraded', components: ['api', 'dashboard'], message: 'Sign-in is failing.' }, AT)
  assert.equal(name, '2026-11-26-api-errors-on-sign-in.md')
  const incident = parseIncident(text, name)
  assert.equal(incident.title, 'API errors on sign-in!')
  assert.deepEqual(incident.components, ['api', 'dashboard'])
  assert.equal(incident.started, '2026-11-26T20:05:00.000Z')
  assert.equal(incident.resolved, null)
  assert.deepEqual(incident.updates, [{ at: '2026-11-26T20:05:00.000Z', label: 'Investigating', text: 'Sign-in is failing.' }])
})

test('newIncident: maintenance starts, an incident for everything names no component, and gaps are refused', () => {
  const { text } = newIncident({ title: 'Database maintenance', impact: 'maintenance', message: 'Brief maintenance.' }, AT)
  assert.ok(text.includes('## 2026-11-26T20:05:00Z Started') && !text.includes('components:'))
  assert.throws(() => newIncident({ title: 'x', impact: 'bad', message: 'm' }, AT), /impact must be one of/)
  assert.throws(() => newIncident({ title: '', impact: 'outage', message: 'm' }, AT), /needs a title/)
  assert.throws(() => newIncident({ title: 'x', impact: 'outage' }, AT), /needs a first update/)
})

test('addUpdate appends an update; resolve also closes the incident, once', () => {
  const { name, text } = newIncident({ title: 'API errors', impact: 'outage', components: ['api'], message: 'Looking into it.' }, AT)
  const updated = addUpdate(text, { label: 'Identified', message: 'A bad deploy.' }, new Date('2026-11-26T20:30:00Z'), name)
  assert.deepEqual(parseIncident(updated, name).updates.map((u) => u.label), ['Investigating', 'Identified'])
  assert.equal(parseIncident(updated, name).resolved, null)
  const resolved = addUpdate(updated, { message: 'Rolled back.', resolve: true }, new Date('2026-11-26T21:10:00Z'), name)
  const incident = parseIncident(resolved, name)
  assert.equal(incident.resolved, '2026-11-26T21:10:00.000Z')
  assert.deepEqual(incident.updates.at(-1), { at: '2026-11-26T21:10:00.000Z', label: 'Resolved', text: 'Rolled back.' })
  assert.throws(() => addUpdate(resolved, { message: 'Again.', resolve: true }, AT, name), /already resolved/)
  assert.throws(() => addUpdate(text, { message: ' ' }, AT, name), /needs a message/)
})
