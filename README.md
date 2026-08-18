# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo.

It renders a Job Summary reflecting the repository's real status — whether it is connected, and
which Develocity features are enabled for it — which it obtains by minting a GitHub Actions OIDC
token and asking the Develocity GitHub App. It never fails the build, and when the app cannot be
reached it reports the last state it knew rather than forgetting the repository was ever configured.

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
| Last known state | Any failure minting the token or calling the app, **and** a cached status under 24h old | "Develocity (last known state)", how old the answer is, and the cached feature table |
| Unreachable | The same failure, with no cached status or one 24h old or older | "Develocity could not be reached", plus the connect link |

Every path appends to `GITHUB_STEP_SUMMARY` and exits 0. Any failure to reach the app — a timeout, a
tunnel that is down, a 401 from the app rejecting the OIDC token — lands in the last two states,
which one depending only on whether there is a recent enough answer to fall back on.

The feature table is rendered from what the app sends — each feature's id, display name and enabled
flag — so this action holds no list of its own and a new feature needs no change here. An app that
sends no `features` field degrades to a plain "connected" summary rather than failing.

The **Manage features** link is the app's `connectUrl`, the same one the other states use: it lands
on `/start`, which forwards a signed-in user to that repository's settings. In this state the app
leaves `&workflow=…` off that URL, so the settings page opens plainly — the workflow parameter is
what makes the connect dialog open on arrival, and there is nothing to connect here.

## When Develocity cannot be reached

A repository that is genuinely connected, with features somebody chose weeks ago, should not report
as though nothing were configured because a service blipped. So a successful status check is
remembered, and a failed one falls back to it for up to **24 hours**.

| Situation | Summary |
| --- | --- |
| App reachable | Live status, and the remembered copy is refreshed |
| App unreachable, remembered copy under 24h old | That copy, stated as last-known and dated |
| App unreachable, remembered copy 24h old or older, or absent | "Develocity could not be reached" |

The window exists because a copy stops being evidence at some point. Inside it, the cached answer is
almost certainly still true — features change on a scale of weeks, not hours. Past it, the honest
thing to say is that nothing is known, so the summary degrades exactly as it did before this
existed.

The stale summary always says so, and says roughly how old the answer is, because a remembered
feature table presented as a live one would be worse than showing no table at all. Whether the
cached status was *connected* decides which stale summary is rendered — a repository last known to be
unconnected gets the connect CTA, not a feature table.

**Not opting in is not a failure to reach anything.** A workflow with no `develocity-url`, or without
`id-token: write`, never contacts the app, so the cache is not consulted on that path: the action has
learned nothing that a cached answer could stand in for.

### Where the cached status lives

This is the whole difficulty, and it is worth being plain about: the app is the thing that goes down,
so the copy has to live on the action side — and a GitHub Actions runner is ephemeral.

**A real implementation would use the GitHub Actions cache service.** It is the only store an action
can reach that survives a run without either a token the workflow does not grant or state written
somewhere it does not belong. Two things about it shape the design, and neither is obvious:

- **Entries are immutable.** A key cannot be overwritten, so "refresh the copy" means writing a new
  key each run and restoring by prefix, not updating one in place.
- **Entries are branch-scoped.** A pull request run can read the default branch's copy but writes into
  a scope the default branch can never see, so a PR run cannot refresh the copy the next push reads.

It is also not one call. The current service is v2 — `ACTIONS_RESULTS_URL` and Twirp endpoints, not
the retired `ACTIONS_CACHE_URL` — where a write is create-entry, `PUT` to a signed blob URL, then
finalize. Doable with plain `fetch`, but it would be by a wide margin the largest thing in this
action, and none of it can be exercised anywhere but a live runner.

**This demo does not build it.** `readCache` and `writeCache` in `index.js` are the seam; everything
on either side of them — the window, the freshness check, the age wording, the choice of stale
summary, the refresh after a success — is real, and only where the bytes live is stood in for:

| Store | What it is |
| --- | --- |
| `$RUNNER_TEMP/develocity-status.json` | Genuinely written after every successful check, and genuinely read back. But `$RUNNER_TEMP` does not outlive the job, so a *later* run never finds it. |
| `demo-cache.json`, committed beside `index.js` | The stand-in for storage that survives a run. Read only when the runtime copy is absent. |

Either store is ignored unless its `repository` matches `GITHUB_REPOSITORY`: a status is only ever
evidence about the repository it was read for, and a fixture that answered for any repository would
be a lie rather than a stand-in. An unreadable or malformed store is logged and skipped, never fatal.

The fixture carries `cachedAgeHours` instead of a fixed date — it dates itself relative to now, so it
does not silently expire between demos, and all three rows of the table above are one number apart
rather than a day:

| To show | Do |
| --- | --- |
| Last known state | `cachedAgeHours` under 24 — the committed value is `2` |
| Could not be reached, despite a cached copy | `cachedAgeHours` of `25` |
| Could not be reached, nothing cached | Delete or rename `demo-cache.json` |

That last row is the escape hatch for demoing the genuinely-degraded state, which stopping the tunnel
alone no longer produces.

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
of [four places](https://github.com/develocity-app-2/develocity-github-app#the-public-url-appears-in-four-places)
that must be updated together — and the only one that is a code change rather than config.

Override `audience` only if the app is configured with a matching `OIDC_AUDIENCE`.

## Implementation notes

Plain CommonJS on Node 24 with **no dependencies** — deliberately not using `@actions/core`, so
there is no `node_modules`, no bundler and no build step. The whole action is `action.yml`,
`index.js` and the `demo-cache.json` fixture. The OIDC token is requested straight from the runner's
`ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, which is all `@actions/core`
would have done.

Both requests use a 10s timeout. The repository, repository id and owner id used to build the
fallback connect URL come from `GITHUB_REPOSITORY`, `GITHUB_REPOSITORY_ID` and
`GITHUB_REPOSITORY_OWNER_ID` — the fallback is only used when the app is never reached; otherwise
the app supplies the URL, built from claims it has verified.
