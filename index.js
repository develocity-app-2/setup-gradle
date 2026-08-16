const fs = require('fs')

// GitHub uppercases input names and replaces spaces with underscores, but leaves
// dashes alone: `develocity-app-url` arrives as `INPUT_DEVELOCITY-APP-URL`.
const getInput = (name) => process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || ''

const appUrl = getInput('develocity-app-url').replace(/\/+$/, '')
const repo = process.env.GITHUB_REPOSITORY

// The numeric ids let the app pre-select this repository on GitHub's install
// screen. They have to come from here: a private repo's id cannot be looked up
// before the app is installed on it.
const repoId = process.env.GITHUB_REPOSITORY_ID
const ownerId = process.env.GITHUB_REPOSITORY_OWNER_ID

// `owner/repo` is already URL-safe and `/` is legal unencoded in a query value,
// so the URL stays readable on screen rather than %2F-mangled.
const startUrl = `${appUrl}/start?repo=${repo}&repo_id=${repoId}&owner_id=${ownerId}`

const summary = `
### Develocity is not configured for this repository

This build ran \`setup-gradle\` without a Develocity server, so no build data was reported and no caching or build scan publishing took place.

**[Connect \`${repo}\` to Develocity →](${startUrl})**
`

fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
