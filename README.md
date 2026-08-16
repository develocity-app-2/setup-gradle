# setup-gradle (mock)

A stand-in for `gradle/actions/setup-gradle`, used only by the Develocity GitHub App demo.

It does as little as possible: it renders a Job Summary stating that Develocity is not configured,
with a link to the Develocity GitHub App's `/start` page.

## Usage

```yaml
- uses: develocity-app-2/setup-gradle@main
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `develocity-app-url` | `https://mortician-fling-outsell.ngrok-free.dev` | Base URL of the Develocity GitHub App |

## Implementation notes

Plain CommonJS on Node 24 with **no dependencies** — deliberately not using `@actions/core`, so
there is no `node_modules`, no bundler and no build step. The whole action is `action.yml` plus
`index.js`.
