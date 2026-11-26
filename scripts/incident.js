/* global process, console */
// Post or update an incident without writing the file by hand.
//
//   node scripts/incident.js new --title "API errors on sign-in" --impact degraded --components api,dashboard \
//     --message "Sign-in requests are failing for some agencies."
//   node scripts/incident.js update incidents/2026-11-26-api-errors-on-sign-in.md --message "A fix is rolling out." [--label Identified]
//   node scripts/incident.js resolve incidents/2026-11-26-api-errors-on-sign-in.md --message "A bad deploy was rolled back."
//
// It only writes the file: commit and push it to publish. `impact` is outage, degraded or maintenance.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addUpdate, newIncident } from '../src/incidents.js'
import { components } from '../status.config.js'

const [command, ...rest] = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i]
  else positional.push(rest[i])
}
const here = fileURLToPath(new URL('..', import.meta.url))

try {
  if (command === 'new') {
    const ids = (flags.components ?? '').split(',').map((c) => c.trim()).filter(Boolean)
    const unknown = ids.filter((id) => !components.some((c) => c.id === id))
    if (unknown.length) throw new Error(`Unknown components: ${unknown.join(', ')}. Known: ${components.map((c) => c.id).join(', ')}`)
    const { name, text } = newIncident({ title: flags.title, impact: flags.impact, components: ids, message: flags.message, label: flags.label }, new Date())
    mkdirSync(join(here, 'incidents'), { recursive: true })
    writeFileSync(join(here, 'incidents', name), text, { flag: 'wx' }) // never over an existing incident
    console.log(`Wrote incidents/${name}. Commit and push it to publish.`)
  } else if (command === 'update' || command === 'resolve') {
    const file = positional[0]
    if (!file) throw new Error(`Usage: incident.js ${command} incidents/<file>.md --message "…"`)
    const text = addUpdate(readFileSync(file, 'utf8'), { label: flags.label, message: flags.message, resolve: command === 'resolve' }, new Date(), basename(file))
    writeFileSync(file, text)
    console.log(`Updated ${file}. Commit and push it to publish.`)
  } else {
    throw new Error('Usage: incident.js new|update|resolve … (see the top of scripts/incident.js)')
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
