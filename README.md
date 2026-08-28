# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo. It
renders a Job Summary reflecting the repository's real status — whether it is connected, and which
Develocity features are enabled for it — which it obtains by minting a GitHub Actions OIDC token
and asking the app. It never fails the build.

**Without a `develocity-url` input it does nothing at all.** Connecting is something a workflow has
to say out loud, rather than something that follows from the app happening to be installed.

**This file covers using the action. The design of record is
[`docs/design/setup-gradle-action.md`](https://github.com/develocity-app-2/docs/blob/main/design/setup-gradle-action.md)** — the summary
states, what happens when Develocity cannot be reached, and the reasoning behind the interface.

---

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
silently falls back to the last known state, or to "could not be reached" once there is no recent one
— which makes a mismatch quieter than it used to be, and worth suspecting early. If the tunnel hostname ever changes, this file is one
of [four places](github-app.md#the-public-url-appears-in-four-places)
that must be updated together — and the only one that is a code change rather than config.

Override `audience` only if the app is configured with a matching `OIDC_AUDIENCE`.
