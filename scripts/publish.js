/* global process, console */
// Copy this directory to the repository that hosts the page, and push. Run from the Surlos monorepo after committing
// a change to apps/status: the monorepo is the source, and the hosting repository adds only the live history.
//
//   node scripts/publish.js            # publish
//   node scripts/publish.js --dry-run  # show what would change, push nothing
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY = 'https://github.com/stonebaldwin/surlos-status.git'
// The hosting repository's own: the history the checker commits there.
const THEIRS = new Set(['data/history.json'])

const here = fileURLToPath(new URL('..', import.meta.url))
const dryRun = process.argv.includes('--dry-run')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

if (git(here, 'status', '--porcelain', '--', '.')) {
  console.error('apps/status has uncommitted changes. Commit them first: what is published should be what is in git.')
  process.exit(1)
}
const source = git(here, 'rev-parse', '--short', 'HEAD')
const files = git(here, 'ls-files', '.').split('\n').filter((file) => file && !THEIRS.has(file))

const clone = mkdtempSync(join(tmpdir(), 'surlos-status-'))
try {
  git(clone, 'clone', '--quiet', '--depth', '1', REPOSITORY, '.')
  // Files deleted here are deleted there: start from only what is theirs.
  for (const tracked of git(clone, 'ls-files').split('\n').filter(Boolean)) {
    if (!THEIRS.has(tracked)) rmSync(join(clone, tracked), { force: true })
  }
  for (const file of files) {
    mkdirSync(dirname(join(clone, file)), { recursive: true })
    cpSync(join(here, file), join(clone, file))
  }
  mkdirSync(join(clone, '.github/workflows'), { recursive: true })
  cpSync(join(here, 'workflow/status.yml'), join(clone, '.github/workflows/status.yml'))
  git(clone, 'add', '--all')
  const changes = git(clone, 'status', '--porcelain')
  if (!changes) {
    console.log('Nothing to publish: the hosting repository already matches.')
  } else if (dryRun) {
    console.log(`Would publish (from ${source}):\n${changes}`)
  } else {
    const identity = ['-c', `user.name=${git(here, 'config', 'user.name')}`, '-c', `user.email=${git(here, 'config', 'user.email')}`]
    execFileSync('git', [...identity, 'commit', '--quiet', '-m', `Mirror apps/status at ${source}`], { cwd: clone })
    git(clone, 'push', '--quiet', 'origin', 'HEAD')
    console.log(`Published ${source}:\n${changes}`)
  }
} finally {
  rmSync(clone, { recursive: true, force: true })
}
