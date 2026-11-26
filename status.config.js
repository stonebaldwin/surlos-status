// What status.surlos.com watches and says. Plain data: the checker (scripts/check.js) and the page (scripts/build.js)
// both read it.

export const site = {
  name: 'Surlos',
  title: 'Surlos Status',
  url: 'https://status.surlos.com',
  home: 'https://surlos.com',
  /** Days of history on the page. */
  days: 90,
  /** Minutes between scheduled checks (the workflow's cron). Shown on the page. */
  intervalMinutes: 5,
  /** Where "Report a problem" goes, e.g. 'mailto:support@surlos.com'. The button is left out while this is empty. */
  reportUrl: '',
}

/**
 * One row on the page per component. Each has one or more probes; the component is up when every probe is.
 * `expect` lists the HTTP statuses that mean "up". Redirects are not followed: while the private-preview gate is on,
 * the site, docs and dashboard answer 303 to /unlock, which still proves the Worker is serving.
 */
export const components = [
  {
    id: 'api',
    name: 'API',
    description: 'api.surlos.com',
    probes: [
      { url: 'https://api.surlos.com/v1/openapi.json', expect: [200] },
      // An unknown key is refused only after the key lookup, so a 401 here means the API reached its database.
      { url: 'https://api.surlos.com/v1/account', expect: [401], headers: { Authorization: 'Bearer sk_test_statuscheck0000000000000000000000' } },
    ],
  },
  { id: 'dashboard', name: 'Dashboard', description: 'app.surlos.com', probes: [{ url: 'https://app.surlos.com/unlock', expect: [200] }] },
  { id: 'docs', name: 'Docs', description: 'docs.surlos.com', probes: [{ url: 'https://docs.surlos.com/unlock', expect: [200] }] },
  { id: 'web', name: 'Website', description: 'surlos.com', probes: [{ url: 'https://surlos.com/unlock', expect: [200] }] },
]
