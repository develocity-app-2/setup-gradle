# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo.

It renders a Job Summary reflecting the repository's real status — whether it is connected, and
which Develocity features are enabled for it — which it obtains by minting a GitHub Actions OIDC
token and asking the Develocity GitHub App. It never fails the build.

The features are placeholders: nothing about the build changes when they are on. Reporting them is
the whole effect.

## Usage

```yaml
permissions:
  contents: read
  id-token: write

jobs:
  build:
    steps:
      - uses: develocity-app-2/setup-gradle@main
```

`contents: read` must be listed explicitly: adding a `permissions:` block restricts the token to
exactly what it names, so omitting it breaks `actions/checkout`.

Without `id-token: write` the action still works, but cannot determine the repository's status, so
it renders the connect prompt plus a message explaining how to grant the permission.

## Summary states

| State | When | Summary |
| --- | --- | --- |
| Connected | App installed and enabled for the repo | "This build is connected to Develocity via `<account>`", a table of every feature and whether it is enabled, and a **Manage features** link |
| Not configured | App not installed, or repo not enabled | Connect prompt with a CTA |
| Cannot identify | No `id-token: write` | Connect prompt, plus how to grant the permission |
| Unreachable | Any failure minting the token or calling the app | "Develocity could not be reached", plus the connect link |

Every path appends to `GITHUB_STEP_SUMMARY` and exits 0; the `unreachable` state is the catch-all
for anything thrown, including a 401 from the app rejecting the OIDC token.

The feature table is rendered from what the app sends — each feature's id, display name and enabled
flag — so this action holds no list of its own and a new feature needs no change here. An app that
sends no `features` field degrades to a plain "connected" summary rather than failing.

The **Manage features** link is the app's `connectUrl`, the same one the other states use: it lands
on `/start`, which forwards a signed-in user to that repository's settings.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `develocity-app-url` | `https://mortician-fling-outsell.ngrok-free.dev` | Base URL of the Develocity GitHub App |
| `audience` | (the app URL) | Audience for the OIDC token |

**The `develocity-app-url` default is a hardcoded ngrok hostname.** It is what lets `demo-app` use
a bare `uses:` with no `with:` block, and it must match the app's own `PUBLIC_URL` — the app
derives the OIDC audience it will accept from that value, so a mismatch means every call is
rejected with a 401 and the summary silently falls back to "could not be reached". If the tunnel
hostname ever changes, this file is one of
[four places](https://github.com/develocity-app-2/develocity-github-app#the-public-url-appears-in-four-places)
that must be updated together — and the only one that is a code change rather than config.

Override `audience` only if the app is configured with a matching `OIDC_AUDIENCE`.

## Implementation notes

Plain CommonJS on Node 24 with **no dependencies** — deliberately not using `@actions/core`, so
there is no `node_modules`, no bundler and no build step. The whole action is `action.yml` plus
`index.js`. The OIDC token is requested straight from the runner's
`ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, which is all `@actions/core`
would have done.

Both requests use a 10s timeout. The repository, repository id and owner id used to build the
fallback connect URL come from `GITHUB_REPOSITORY`, `GITHUB_REPOSITORY_ID` and
`GITHUB_REPOSITORY_OWNER_ID` — the fallback is only used when the app is never reached; otherwise
the app supplies the URL, built from claims it has verified.
