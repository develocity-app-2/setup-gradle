# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo.

It renders a Job Summary reflecting the repository's real status — whether it is connected, and
which Develocity features are enabled for it — which it obtains by minting a GitHub Actions OIDC
token and asking the Develocity GitHub App. It never fails the build.

**Without a `develocity-url` input it does nothing at all** — no token is minted and the app is not
contacted. Connecting is something a workflow has to say out loud, rather than something that
follows from the app happening to be installed.

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
        with:
          develocity-url: https://mortician-fling-outsell.ngrok-free.dev
```

Two things are needed, and they mean different things:

- **`develocity-url`** is the opt-in. Without it the action contacts nothing. Its value is not used
  as an address in this demo — the app is always at a fixed URL — it is the workflow declaring that
  this build should use Develocity.
- **`id-token: write`** lets the workflow prove which repository it is. `contents: read` must be
  listed alongside it: adding a `permissions:` block restricts the token to exactly what it names, so
  omitting it breaks `actions/checkout`.

Missing either one, the action renders the connect prompt and nothing else. It deliberately does not
explain how to fix it: the CTA leads to a pull request that makes the change, which is a better
answer than a snippet to copy.

You do not have to add them by hand. The connect link carries this workflow's path, taken from
`GITHUB_WORKFLOW_REF` — which is available whatever the workflow's permissions are, unlike the OIDC
claims. The app opens its workflow dialog with this workflow already selected, and can open a pull
request making both changes.

## Summary states

| State | When | Summary |
| --- | --- | --- |
| Connected | `develocity-url` and `id-token: write` present, app installed and enabled | "This build is connected to Develocity via `<account>`", a table of every feature and whether it is enabled, and a **Manage features** link |
| Not configured | App not installed, or repo not enabled | Connect prompt with a CTA |
| Not opted in | `develocity-url` and/or `id-token: write` missing | Connect prompt with a CTA |
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
| `develocity-url` | (none) | Develocity server URL. Without it the action contacts nothing. |
| `audience` | (the app URL) | Audience for the OIDC token |

**The app's own address is a constant in `index.js`, not an input.** That is deliberate: the connect
CTA is what an *unconfigured* workflow renders, so the app's address cannot come from configuration
that does not exist yet. Merging it into `develocity-url` would leave an unconfigured workflow with
nothing to build the link from.

That constant must match the app's own `PUBLIC_URL` — the app derives the OIDC audience it will
accept from that value, so a mismatch means every call is rejected with a 401 and the summary
silently falls back to "could not be reached". If the tunnel hostname ever changes, this file is one
of [four places](https://github.com/develocity-app-2/develocity-github-app#the-public-url-appears-in-four-places)
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
