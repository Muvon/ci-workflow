# ci-brief-action

Generate PR briefs in CI using [Octomind](https://octomind.run).

Thin wrapper around [`muvon/octomind-action`](https://github.com/muvon/octomind-action) that:

- Picks the prompt automatically based on the PR event action
  - `synchronize` → incremental diff between `before`/`after` SHAs
  - anything else (`opened`, `reopened`, `ready_for_review`, …) → full branch-vs-base comparison
- Defaults to `developer:brief` role, `ollama:glm-5.1` model, and `full` comment mode

Pin to `@master` — no versioning. Change behavior here, propagates to every repo.

## Usage (preferred — reusable workflow)

One job line per repo. Secrets are inherited from the caller, so individual workflows
don't need to reference them.

```yaml
# .github/workflows/ci.yml
on:
  push: { branches: [master, main] }
  pull_request: { branches: [master, main] }

jobs:
  brief:
    uses: muvon/ci-brief-action/.github/workflows/brief.yml@master
    secrets: inherit
```

Configure provider API keys (`OLLAMA_API_KEY`, `OPENROUTER_API_KEY`, …) once as
**organization secrets** with visibility "all repositories" — every repo inherits them
without per-repo configuration. Repo-level secrets also work.

Optional overrides:

```yaml
jobs:
  brief:
    uses: muvon/ci-brief-action/.github/workflows/brief.yml@master
    secrets: inherit
    with:
      role: developer:brief
      model: openrouter:anthropic/claude-sonnet-4
      comment: compact
```

## Usage (alt — composite action)

Use this when you need step-level integration inside an existing job. You handle the
checkout and secret env yourself:

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: muvon/ci-brief-action@master
  env:
    OLLAMA_API_KEY: ${{ secrets.OLLAMA_API_KEY }}
```

## Inputs

| Input          | Default              | Description                                |
| -------------- | -------------------- | ------------------------------------------ |
| `role`         | `developer:brief`    | Octomind role                              |
| `model`        | `ollama:glm-5.1`     | Model override                             |
| `comment`      | `full`               | PR comment mode: `full`, `compact`, `none` |
| `github_token` | `${{ github.token }}` | Token for PR commenting (composite only)   |
