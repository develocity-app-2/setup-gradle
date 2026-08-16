# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo.

It renders a Job Summary reflecting the repository's real status, which it obtains by minting a
GitHub Actions OIDC token and asking the Develocity GitHub App. It never fails the build.

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
| Connected | App installed and enabled for the repo | "This build is connected to Develocity via `<account>`" |
| Not configured | App not installed, or repo not enabled | Connect prompt with a CTA |
| Cannot identify | No `id-token: write` | Connect prompt, plus how to grant the permission |
| Unreachable | App could not be contacted | "Develocity could not be reached", plus the connect link |

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `develocity-app-url` | `https://mortician-fling-outsell.ngrok-free.dev` | Base URL of the Develocity GitHub App |
| `audience` | (the app URL) | Audience for the OIDC token |

## Implementation notes

Plain CommonJS on Node 24 with **no dependencies** — deliberately not using `@actions/core`, so
there is no `node_modules`, no bundler and no build step. The whole action is `action.yml` plus
`index.js`. The OIDC token is requested straight from the runner's
`ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, which is all `@actions/core`
would have done.
