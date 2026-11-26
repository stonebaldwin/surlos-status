# Surlos Status

The source of [status.surlos.com](https://status.surlos.com): a static page built from scheduled uptime checks. It has
no dependencies and does not use the rest of the monorepo at run time, so it can live in its own repository and run on
GitHub Actions and GitHub Pages, outside the Cloudflare account that serves Surlos. A status page that shares
infrastructure with what it reports on goes down with it.

## How it works

| Piece | What it does |
| --- | --- |
| `status.config.js` | The components, the URLs that are checked for each, and what "up" looks like. |
| `scripts/check.js` | One round of checks. Adds the result to `data/history.json` (checks and failures per component per day). |
| `scripts/build.js` | Builds `dist/`: the page, an Atom feed of incidents, `status.json` and the assets. |
| `src/client.js` | The page's script: day cards, the calendar's months, and freshness. The page reads without it. |
| `incidents/*.md` | Incidents, written by hand. |
| `workflow/status.yml` | The scheduled workflow: check, commit the history, build, publish. |
| `assets/` | The brand kit's tokens, logos and fonts, copied in by `scripts/sync-assets.js`. |

A day's bar is green with no failed checks, amber with some, and red when half or more failed. An incident colours the
days and components it names, whatever the checks said. Uptime is successful checks over all checks in the window.

The page also shows each component's average response time over the window, as measured by the checks. `status.json`
holds the current state for programs. The page polls it once a minute and reloads when a newer check is published,
and it warns the reader when the last check is more than 25 minutes old, so a stalled checker cannot pass for a
healthy system.

The checks do not follow redirects and do not sign in. While the private-preview gate is on they prove that each
Worker is serving, and for the API that it reaches its database; they do not exercise the pages behind the gate.

## Alerts

When a component that was up is found down, that run publishes the page and then fails on purpose. GitHub emails a
failed scheduled run to whoever last changed the workflow's schedule, so the failure is the alert: check that
"Actions" notifications are on under GitHub's notification settings. Only the change raises it; while the component
stays down, later runs pass and the page shows the outage. A recovery is noted on the run and shows on the page.

## Post an incident

The helper writes the file; commit and push it to publish. The page rebuilds within a minute.

```bash
node scripts/incident.js new --title "API errors on sign-in" --impact degraded --components api,dashboard \
  --message "Sign-in requests are failing for some agencies."
node scripts/incident.js update incidents/<file>.md --message "A fix is rolling out." --label Identified
node scripts/incident.js resolve incidents/<file>.md --message "A bad deploy was rolled back."
```

Or write the file by hand: add it to `incidents/`, named for its date.

```md
---
title: API errors on sign-in
impact: degraded
components: api, dashboard
started: 2026-11-26T20:05:00Z
---
## 2026-11-26T20:05:00Z Investigating
Sign-in requests are failing for some agencies.
```

- `impact` is `outage`, `degraded` or `maintenance`.
- `components` are ids from `status.config.js`. Leave the line out for an incident that affects everything.
- Add a `## <time> <label>` section for each update. Times are UTC.
- When it is over, add `resolved: <time>` to the top and a final update. Until then the incident leads the page.

A file with a mistake in it fails the build with its name, and the published page stays as it was.

## Commands

```bash
node scripts/check.js              # one round of checks, into data/history.json
node scripts/build.js              # build dist/
node scripts/demo.js               # build dist/ from made-up data, to see every state
node --test "test/*.test.js"       # the tests
node scripts/sync-assets.js        # inside the monorepo only: refresh assets/ from the brand kit
node scripts/publish.js            # inside the monorepo only: copy this directory to the hosting repository
```

## Hosting

The page is hosted from [stonebaldwin/surlos-status](https://github.com/stonebaldwin/surlos-status). This directory is
the source; after committing a change here, `node scripts/publish.js` copies it there (everything but the live
history, which the checker commits in that repository). To set up hosting from scratch:

1. Create a public repository with this directory's contents at its root, and copy `workflow/status.yml` to
   `.github/workflows/status.yml`.
2. In the repository's settings, set Pages to deploy from GitHub Actions.
3. Add a DNS record `status` → `CNAME` → `<owner>.github.io` in the `surlos.com` zone, **DNS only** (not proxied through
   Cloudflare, or the page depends on Cloudflare again), and set the custom domain to `status.surlos.com` in the Pages
   settings. `scripts/build.js` writes the `CNAME` file Pages expects.
