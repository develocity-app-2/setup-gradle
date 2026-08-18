const fs = require('fs')
const path = require('path')

// GitHub uppercases input names and replaces spaces with underscores, but leaves
// dashes alone: `develocity-url` arrives as `INPUT_DEVELOCITY-URL`.
const getInput = (name) => process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || ''

// Where the Develocity GitHub App lives. A constant rather than an input,
// because the CTA below is what an *unconfigured* workflow renders: the app's
// address cannot come from configuration that does not exist yet.
const APP_URL = 'https://mortician-fling-outsell.ngrok-free.dev'

// The opt-in. Its value is not used as an address -- the app is always at
// APP_URL -- it is the workflow saying out loud that this build should use
// Develocity. Without it nothing is contacted at all.
const develocityUrl = getInput('develocity-url').trim()
const audience = getInput('audience') || APP_URL

const repo = process.env.GITHUB_REPOSITORY
const repoId = process.env.GITHUB_REPOSITORY_ID
const ownerId = process.env.GITHUB_REPOSITORY_OWNER_ID

// `owner/repo/.github/workflows/ci.yml@refs/heads/main` -> the path alone.
// Unlike the OIDC claims this is present whatever the workflow's permissions
// are, which is the whole point: the app needs to know which workflow to offer
// to fix precisely when that workflow could not identify itself.
const workflowRef = process.env.GITHUB_WORKFLOW_REF || ''
const workflowMatch = workflowRef.split('@')[0].match(/(\.github\/workflows\/.+)$/)
const workflow = workflowMatch ? `&workflow=${workflowMatch[1]}` : ''

// Used when we never reach the app; otherwise the app supplies this URL, built
// from claims it has verified.
const fallbackConnectUrl = `${APP_URL}/start?repo=${repo}&repo_id=${repoId}&owner_id=${ownerId}${workflow}`

const TIMEOUT_MS = 10000

// How long a remembered status stands in for a live one. Past this the copy is
// no longer evidence about the repository, only a memory of one.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const notConfigured = (connectUrl) => `
### Your build could be better and faster with Develocity

This build ran \`setup-gradle\` without connecting to Develocity, missing out on build scans, failure analytics and enhanced caching.

**[Connect \`${repo}\` to Develocity →](${connectUrl})**
`

// The app sends names alongside ids, so this renders whatever it is given and
// needs no list of its own. An older app that sends none degrades to a plain
// "connected" summary rather than throwing.
const featureTable = (features) => {
  if (!Array.isArray(features) || features.length === 0) return ''

  const rows = features
    .map((feature) => `| ${feature.name} | ${feature.enabled ? 'Enabled' : 'Not enabled'} |`)
    .join('\n')

  return `
| Feature | Status |
| --- | --- |
${rows}
`
}

const connected = (account, url, features) => `
### Develocity

This build is connected to Develocity via \`${account}\`.
${featureTable(features)}
[Manage features →](${url})
`

// A remembered feature table presented as a live one would be worse than no
// table at all, so both stale summaries lead with what they are and how old
// the answer is. Rounded, because the precise second is not the point.
const cachedAge = (cachedAt) => {
  const hours = (Date.now() - cachedAt.getTime()) / (60 * 60 * 1000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 2) return 'about an hour ago'
  return `about ${Math.round(hours)} hours ago`
}

const staleNotice = (age) => `### Develocity (last known state)

\`setup-gradle\` could not contact Develocity, so this reports what was last known about \`${repo}\`, checked ${age}. It may be out of date.`

const staleConnected = (status, age) => `
${staleNotice(age)}

This repository was connected to Develocity via \`${status.account}\`.
${featureTable(status.features)}
[Manage features →](${status.connectUrl || fallbackConnectUrl})
`

const staleNotConfigured = (status, age) => `
${staleNotice(age)}

\`${repo}\` was not connected to Develocity.

**[Connect \`${repo}\` to Develocity →](${status.connectUrl || fallbackConnectUrl})**
`

const unreachable = () => `
### Develocity could not be reached

\`setup-gradle\` could not contact Develocity to check this repository's status.

**[Connect \`${repo}\` to Develocity →](${fallbackConnectUrl})**
`

// ---------------------------------------------------------------------------
// Last known good status
//
// The app is the thing that goes down, so the copy has to live on the action
// side -- which on an ephemeral runner is the whole difficulty. Everything
// here is real except where the bytes live: a real implementation would put
// them in the GitHub Actions cache service, and this demo stands that in with
// a committed fixture. `readCache` and `writeCache` are the seam, and nothing
// on either side of them knows the difference. See README.
// ---------------------------------------------------------------------------

const CACHE_FILE = 'develocity-status.json'

// Really written, and really read back -- but $RUNNER_TEMP does not outlive the
// job, so this is never what a *later* run finds.
const runtimeCachePath = process.env.RUNNER_TEMP
  ? path.join(process.env.RUNNER_TEMP, CACHE_FILE)
  : null

// The stand-in for storage that survives a run: a fixture committed beside this
// file. `cachedAgeHours` in it is a demo control -- it dates the fixture
// relative to now, so the fresh and the expired case are one number apart
// rather than a day.
const fixtureCachePath = path.join(__dirname, 'demo-cache.json')

// The runtime copy first: within a job it is the newer of the two, and it is
// the one a real implementation would have written.
const readCache = () => {
  for (const file of [runtimeCachePath, fixtureCachePath].filter(Boolean)) {
    try {
      if (!fs.existsSync(file)) continue

      const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
      const cachedAt =
        typeof entry.cachedAgeHours === 'number'
          ? new Date(Date.now() - entry.cachedAgeHours * 60 * 60 * 1000)
          : new Date(entry.cachedAt)

      // A status is only ever evidence about the repository it was read for.
      if (entry.repository !== repo || !entry.status || Number.isNaN(cachedAt.getTime())) {
        console.log(`Ignoring cache at ${file}: not a usable record for ${repo}`)
        continue
      }

      return { status: entry.status, cachedAt }
    } catch (error) {
      console.log(`Ignoring unreadable cache at ${file}: ${error.message}`)
    }
  }

  return null
}

const writeCache = (status) => {
  if (!runtimeCachePath) return

  try {
    const entry = { repository: repo, cachedAt: new Date().toISOString(), status }
    fs.writeFileSync(runtimeCachePath, `${JSON.stringify(entry, null, 2)}\n`)
    console.log(`Cached Develocity status to ${runtimeCachePath}`)
  } catch (error) {
    // Failing to remember is not worth failing over, or even warning about.
    console.log(`Could not cache Develocity status: ${error.message}`)
  }
}

async function mintIdToken(requestUrl, requestToken) {
  // The runner's URL already carries ?api-version=, hence the `&`.
  const response = await fetch(`${requestUrl}&audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`ID token request failed (${response.status})`)

  const { value } = await response.json()
  if (!value) throw new Error('ID token response contained no value')
  return value
}

async function fetchStatus(idToken) {
  const response = await fetch(`${APP_URL}/api/repo-status`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`repo-status failed (${response.status})`)
  return await response.json()
}

// Only reached when the app could not be reached at all. A copy inside the
// window stands in for the live answer -- a repository that is genuinely
// connected should not report as unconfigured because a service blipped. Past
// the window there is nothing honest left to say but that nothing is known.
function lastKnownSummary() {
  const cached = readCache()
  if (!cached) {
    console.log('No cached Develocity status to fall back on')
    return unreachable()
  }

  const ageMs = Date.now() - cached.cachedAt.getTime()
  if (ageMs >= CACHE_TTL_MS) {
    const hours = Math.round(ageMs / (60 * 60 * 1000))
    console.log(`Cached Develocity status is ~${hours}h old, past the 24h window; reporting unreachable`)
    return unreachable()
  }

  console.log(`Reporting Develocity status cached at ${cached.cachedAt.toISOString()}`)
  const age = cachedAge(cached.cachedAt)
  return cached.status.connected
    ? staleConnected(cached.status, age)
    : staleNotConfigured(cached.status, age)
}

async function buildSummary() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN

  // Both are absent unless the workflow grants `id-token: write`.
  const hasToken = Boolean(requestUrl && requestToken)

  // No develocity-url means this workflow has not opted in, so Develocity is
  // not contacted at all -- not even to mint a token. Nothing failed to be
  // reached here, so the cache has no business in this path.
  if (!develocityUrl || !hasToken) {
    console.log(
      `Not contacting Develocity: ${[
        !develocityUrl && 'no develocity-url input',
        !hasToken && 'this workflow lacks id-token: write',
      ]
        .filter(Boolean)
        .join('; ')}`
    )
    return notConfigured(fallbackConnectUrl)
  }

  let status
  try {
    status = await fetchStatus(await mintIdToken(requestUrl, requestToken))
  } catch (error) {
    console.log(`Could not determine Develocity status: ${error.message}`)
    return lastKnownSummary()
  }

  const enabled = (status.features || []).filter((feature) => feature.enabled).map((f) => f.id)
  console.log(
    `Develocity reports connected=${status.connected} for ${status.repository}` +
      `, features enabled: ${enabled.join(', ') || 'none'}`
  )

  writeCache(status)

  return status.connected
    ? connected(status.account, status.connectUrl || fallbackConnectUrl, status.features)
    : notConfigured(status.connectUrl || fallbackConnectUrl)
}

// Never fail the build: every path renders something and exits 0. Reaching this
// catch means something other than reachability broke, so it does not reach for
// the cache -- that is `lastKnownSummary`'s job, above.
buildSummary()
  .catch((error) => {
    console.log(`Could not build the Develocity summary: ${error.message}`)
    return unreachable()
  })
  .then((summary) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary))
