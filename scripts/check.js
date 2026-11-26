// Run one round of checks and record it in data/history.json. Run by the scheduled workflow every few minutes.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emptyHistory, record } from '../src/history.js'
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
for (const [id, result] of Object.entries(results)) console.log(`${result.ok ? 'up  ' : 'DOWN'} ${id}: ${result.ok ? `${result.ms}ms` : result.detail}`)
