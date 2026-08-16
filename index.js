const fs = require('fs')

// GitHub uppercases input names and replaces spaces with underscores, but leaves
// dashes alone: `develocity-app-url` arrives as `INPUT_DEVELOCITY-APP-URL`.
const getInput = (name) => process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || ''

const appUrl = getInput('develocity-app-url').replace(/\/+$/, '')
const audience = getInput('audience') || appUrl

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
const fallbackConnectUrl = `${appUrl}/start?repo=${repo}&repo_id=${repoId}&owner_id=${ownerId}${workflow}`

const TIMEOUT_MS = 10000

const notConfigured = (connectUrl) => `
### Develocity is not configured for this repository

This build ran \`setup-gradle\` without a Develocity server, so no build data was reported and no caching or build scan publishing took place.

**[Connect \`${repo}\` to Develocity →](${connectUrl})**
`

// Shown alongside the message above: without an OIDC token we cannot tell
// whether the repository is connected, so the headline stays as it is.
const cannotIdentify = () => `
### This workflow cannot identify itself to Develocity

It needs \`id-token: write\`. Follow the link above and Develocity will offer to open a pull request adding it, with this workflow already selected. Or add it by hand:

\`\`\`yaml
permissions:
  contents: read
  id-token: write
\`\`\`
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

const unreachable = () => `
### Develocity could not be reached

\`setup-gradle\` could not contact Develocity to check this repository's status.

**[Connect \`${repo}\` to Develocity →](${fallbackConnectUrl})**
`

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
  const response = await fetch(`${appUrl}/api/repo-status`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`repo-status failed (${response.status})`)
  return await response.json()
}

async function buildSummary() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN

  // Both are absent unless the workflow grants `id-token: write`.
  if (!requestUrl || !requestToken) {
    console.log('No OIDC token available: this workflow lacks id-token: write')
    return notConfigured(fallbackConnectUrl) + cannotIdentify()
  }

  const status = await fetchStatus(await mintIdToken(requestUrl, requestToken))
  const enabled = (status.features || []).filter((feature) => feature.enabled).map((f) => f.id)
  console.log(
    `Develocity reports connected=${status.connected} for ${status.repository}` +
      `, features enabled: ${enabled.join(', ') || 'none'}`
  )

  return status.connected
    ? connected(status.account, status.connectUrl || fallbackConnectUrl, status.features)
    : notConfigured(status.connectUrl || fallbackConnectUrl)
}

// Never fail the build: every path renders something and exits 0.
buildSummary()
  .catch((error) => {
    console.log(`Could not determine Develocity status: ${error.message}`)
    return unreachable()
  })
  .then((summary) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary))
