// Run one round of checks and record it in data/history.json. Run by the scheduled workflow every few minutes.
/* global process */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emptyHistory, record, transitions } from '../src/history.js'
import { checkComponent } from '../src/probe.js'
import { components } from '../status.config.js'

const file = fileURLToPath(new URL('../data/history.json', import.meta.url))
let history
try {
  history = JSON.parse(readFileSync(file, 'utf8'))
} catch {
  history = emptyHistory()
}

const results = Object.fromEntries(await Promise.all(components.map(async (c) => [c.id, await checkComponent(c)])))
writeFileSync(file, `${JSON.stringify(record(history, results, new Date()), null, 2)}\n`)

// Tell the workflow what changed, so it can raise an alert when something goes down (see workflow/status.yml).
const names = (ids) => ids.map((id) => components.find((c) => c.id === id)?.name ?? id).join(', ')
const changed = transitions(history.latest, results)
const stillDown = Object.keys(results).filter((id) => !results[id].ok)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `down=${names(changed.down)}\nrecovered=${names(changed.recovered)}\nstill_down=${names(stillDown)}\n`)
}
if (changed.down.length) console.log(`went down: ${names(changed.down)}`)
if (changed.recovered.length) console.log(`recovered: ${names(changed.recovered)}`)
for (const [id, result] of Object.entries(results)) console.log(`${result.ok ? 'up  ' : 'DOWN'} ${id}: ${result.ok ? `${result.ms}ms` : result.detail}`)
