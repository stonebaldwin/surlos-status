// Build the static site into dist/: index.html, feed.xml, the stylesheets and the assets. No dependencies.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emptyHistory } from '../src/history.js'
import { parseIncident } from '../src/incidents.js'
import { buildModel, renderFeed, renderPage } from '../src/render.js'
import { components, site } from '../status.config.js'

const here = fileURLToPath(new URL('..', import.meta.url))
const dist = join(here, 'dist')

let history
try {
  history = JSON.parse(readFileSync(join(here, 'data/history.json'), 'utf8'))
} catch {
  history = emptyHistory()
}
// No incidents yet means no directory: git does not keep an empty one.
const incidentFiles = existsSync(join(here, 'incidents')) ? readdirSync(join(here, 'incidents')) : []
const incidents = incidentFiles
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .map((name) => parseIncident(readFileSync(join(here, 'incidents', name), 'utf8'), name))
const known = new Set(components.map((c) => c.id))
for (const incident of incidents) {
  const unknown = incident.components.filter((id) => !known.has(id))
  if (unknown.length) throw new Error(`incidents/${incident.id}.md names unknown components: ${unknown.join(', ')}`)
}

const model = buildModel({ site, components, history, incidents, now: new Date() })
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
cpSync(join(here, 'assets'), dist, { recursive: true })
cpSync(join(here, 'src/status.css'), join(dist, 'status.css'))
writeFileSync(join(dist, 'index.html'), renderPage(model))
writeFileSync(join(dist, 'feed.xml'), renderFeed(model))
// The custom domain, for GitHub Pages.
writeFileSync(join(dist, 'CNAME'), `${new URL(site.url).host}\n`)
console.log(`dist/: ${model.headline.title}; ${model.rows.map((r) => `${r.id} ${r.uptime ?? 'n/a'}`).join(', ')}; ${incidents.length} incidents`)
