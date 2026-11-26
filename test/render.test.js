import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIncident } from '../src/incidents.js'
import { buildModel, renderFeed, renderPage } from '../src/render.js'

const NOW = new Date('2026-11-26T12:00:00Z')
const site = { name: 'Surlos', title: 'Surlos Status', url: 'https://status.example', home: 'https://example.com', days: 90, intervalMinutes: 5, reportUrl: '' }
const components = [
  { id: 'api', name: 'API', description: 'api.example' },
  { id: 'web', name: 'Website', description: 'example.com' },
]
const history = {
  version: 1,
  components: {
    api: { days: { '2026-11-26': { checks: 100, failures: 0 }, '2026-11-25': { checks: 288, failures: 4 }, '2026-11-24': { checks: 288, failures: 200 } } },
    web: { days: { '2026-11-26': { checks: 100, failures: 0 } } },
  },
  latest: { checkedAt: NOW.toISOString(), components: { api: { ok: true, detail: 'ok' }, web: { ok: true, detail: 'ok' } } },
}
const incident = parseIncident(
  '---\ntitle: <b>Maintenance</b> & upgrades\nimpact: maintenance\ncomponents: web\nstarted: 2026-11-20T06:00:00Z\nresolved: 2026-11-20T06:30:00Z\n---\n## 2026-11-20T06:00:00Z Started\nBrief maintenance.\n',
  'maint.md',
)
const model = (extra = {}) => buildModel({ site, components, history, incidents: [incident], now: NOW, ...extra })
const bar = (m, id, key) => m.rows.find((r) => r.id === id).bars.find((b) => b.key === key)

test('each row has one bar per day, levelled from the checks', () => {
  const m = model()
  assert.equal(m.rows[0].bars.length, 90)
  assert.equal(m.rows[0].bars.at(-1).key, '2026-11-26')
  assert.equal(bar(m, 'api', '2026-11-26').level, 'operational')
  assert.deepEqual(bar(m, 'api', '2026-11-25'), { key: '2026-11-25', level: 'degraded', detail: '4 of 288 checks failed' })
  assert.equal(bar(m, 'api', '2026-11-24').level, 'outage')
  assert.equal(bar(m, 'api', '2026-11-01').level, 'nodata')
  assert.equal(m.rows[0].uptime, '69.82')
})

test('an incident marks its component and day, and not the other components', () => {
  const m = model()
  assert.deepEqual(bar(m, 'web', '2026-11-20'), { key: '2026-11-20', level: 'maintenance', detail: '<b>Maintenance</b> & upgrades' })
  assert.equal(bar(m, 'api', '2026-11-20').level, 'nodata')
  assert.deepEqual(m.calendar.find((d) => d.key === '2026-11-20').incidents, ['<b>Maintenance</b> & upgrades'])
  assert.equal(m.calendar.find((d) => d.key === '2026-11-24').level, 'outage')
})

test('an open incident leads the page and marks its component now', () => {
  const open = parseIncident('---\ntitle: API errors\nimpact: outage\ncomponents: api\nstarted: 2026-11-26T11:00:00Z\n---\n## 2026-11-26T11:00:00Z Investigating\nLooking into it.\n', 'open.md')
  const m = model({ incidents: [open] })
  assert.deepEqual(m.headline, { level: 'outage', title: 'API errors', text: 'Looking into it.' })
  assert.equal(m.rows.find((r) => r.id === 'api').level, 'outage')
  assert.equal(m.rows.find((r) => r.id === 'web').level, 'operational')
})

test('the page escapes text, lists every system, and shows the headline', () => {
  const html = renderPage(model())
  assert.match(html, /<h1>.*All systems operational<\/h1>/s)
  assert.ok(html.includes('&lt;b&gt;Maintenance&lt;/b&gt; &amp; upgrades'))
  assert.ok(!html.includes('<b>Maintenance</b>'))
  assert.equal(html.match(/class="bar /g).length, 180)
  assert.ok(html.includes('69.82% uptime') && html.includes('100.00% uptime'))
  assert.ok(!html.includes('Report a problem')) // no reportUrl configured
  assert.match(html, /data-month="2026-11" data-label="Nov 2026">/) // the current month is the one shown
})

test('every month in the window is a whole number of weeks', () => {
  const html = renderPage(model())
  for (const month of html.split('<div class="month"').slice(1)) {
    assert.equal(month.split('</div>')[0].match(/class="cell/g).length % 7, 0)
  }
})

test('"Report a problem" appears when a reportUrl is set', () => {
  assert.ok(renderPage(model({ site: { ...site, reportUrl: 'mailto:help@example.com' } })).includes('href="mailto:help@example.com">Report a problem'))
})

test('the feed lists recent incidents, escaped', () => {
  const xml = renderFeed(model())
  assert.ok(xml.includes('<title>&lt;b&gt;Maintenance&lt;/b&gt; &amp; upgrades</title>'))
  assert.ok(xml.includes('<updated>2026-11-20T06:00:00.000Z</updated>'))
})
