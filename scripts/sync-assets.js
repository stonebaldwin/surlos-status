// Copy the brand kit's files into assets/: the token stylesheet, the logos and the Geist fonts. Run inside the Surlos
// monorepo whenever the kit changes; assets/ is committed, so the status page builds anywhere without the monorepo.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('..', import.meta.url))
const repo = join(here, '../..')
const out = join(here, 'assets')
mkdirSync(join(out, 'brand'), { recursive: true })
mkdirSync(join(out, 'fonts'), { recursive: true })

// The plain-CSS part of the tokens: everything before the Tailwind `@theme` blocks, which a browser would ignore.
const tokens = readFileSync(join(repo, 'packages/tokens/dist/tokens.css'), 'utf8')
writeFileSync(join(out, 'tokens.css'), `${tokens.slice(0, tokens.indexOf('@theme')).trimEnd()}\n`)

const logos = join(repo, 'docs/design/brand/logos')
for (const name of ['surlos-logo.svg', 'surlos-logo-reversed.svg', 'surlos-favicon.svg', 'favicon-32.png', 'apple-touch-icon-180.png']) {
  copyFileSync(join(logos, name), join(out, 'brand', name))
}

// Geist is OFL-licensed; the docs app depends on the package, so take it from there.
const geist = join(repo, 'apps/docs/node_modules/geist')
copyFileSync(join(geist, 'dist/fonts/geist-sans/Geist-Variable.woff2'), join(out, 'fonts/Geist-Variable.woff2'))
copyFileSync(join(geist, 'dist/fonts/geist-mono/GeistMono-Variable.woff2'), join(out, 'fonts/GeistMono-Variable.woff2'))
console.log(`assets/: ${readdirSync(out).join(', ')}`)
