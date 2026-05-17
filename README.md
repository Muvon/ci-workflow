# ci-brief-action

Generate PR briefs in CI using [Octomind](https://octomind.run).

Thin wrapper around [`muvon/octomind-action`](https://github.com/muvon/octomind-action) that:

- Picks the prompt automatically based on the PR event action
  - `synchronize` → incremental diff between `before`/`after` SHAs
  - anything else (`opened`, `reopened`, `ready_for_review`, …) → full branch-vs-base comparison
- Defaults to `developer:brief` role, `ollama:glm-5.1` model, and `full` comment mode

Pin to `@master` — no versioning. Change behavior here, propagates to every repo.

## Usage

```yaml
brief:
  name: PR Brief
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0

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
| `github_token` | `${{ github.token }}` | Token for PR commenting                    |

Provider API keys (e.g. `OLLAMA_API_KEY`, `OPENROUTER_API_KEY`) are passed via job/step `env`.
