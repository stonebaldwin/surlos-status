// Build dist/ from made-up history and incidents, to look at the design with every state on screen:
// `node scripts/demo.js`, then serve dist/. Never run by the workflow. `node scripts/build.js` puts the real page back.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { lastDays } from '../src/history.js'
import { parseIncident } from '../src/incidents.js'
import { buildModel, renderFeed, renderPage } from '../src/render.js'
import { components, site } from '../status.config.js'

await import('./build.js') // the assets and stylesheets

const now = new Date()
const keys = lastDays(now, site.days)
const ago = (days) => keys[keys.length - 1 - days]
const history = { version: 1, components: {}, latest: { checkedAt: now.toISOString(), components: {} } }
components.forEach((component, c) => {
  const days = {}
  keys.forEach((key, i) => {
    if (i < 20 && c > 1) return // two components with a shorter history
    const failures = i === 62 && c === 0 ? 200 : (i * 7 + c * 13) % 41 === 0 ? 6 : 0
    days[key] = { checks: 288, failures }
  })
  history.components[component.id] = { days }
  history.latest.components[component.id] = { ok: true, detail: 'ok' }
})
const incidents = [
  parseIncident(
    `---\ntitle: Elevated API error rates\nimpact: degraded\ncomponents: api, dashboard\nstarted: ${ago(9)}T14:05:00Z\nresolved: ${ago(9)}T15:20:00Z\n---\n` +
      `## ${ago(9)}T14:05:00Z Investigating\nSome API requests are returning errors.\n\n## ${ago(9)}T15:20:00Z Resolved\nA database connection limit was raised. Requests are succeeding again.\n`,
    'demo-errors.md',
  ),
  parseIncident(
    `---\ntitle: Scheduled database maintenance\nimpact: maintenance\ncomponents: api\nstarted: ${ago(3)}T06:00:00Z\nresolved: ${ago(3)}T06:30:00Z\n---\n` +
      `## ${ago(3)}T06:00:00Z Started\nBrief maintenance on the production database.\n`,
    'demo-maintenance.md',
  ),
]
const model = buildModel({ site, components, history, incidents, now })
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
writeFileSync(`${dist}index.html`, renderPage(model))
writeFileSync(`${dist}feed.xml`, renderFeed(model))
console.log('dist/: demo data')
