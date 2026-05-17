# ci-workflow

Reusable GitHub Actions workflow that generates PR briefs using [Octomind](https://octomind.run).

Wraps [`muvon/octomind-action`](https://github.com/muvon/octomind-action) and:

- Picks the prompt automatically based on the PR event action
  - `synchronize` → incremental diff between `before`/`after` SHAs
  - anything else (`opened`, `reopened`, `ready_for_review`, …) → full branch-vs-base
- Defaults to `developer:brief` role, `ollama:glm-5.1` model, `full` comment mode
- Inherits provider API keys from caller secrets — no per-repo env wiring

Pin to `@master` — no versioning. Change behavior here, propagates to every repo.

## Usage

One job in each repo:

```yaml
# .github/workflows/ci.yml
on:
  push: { branches: [master, main] }
  pull_request: { branches: [master, main] }

jobs:
  brief:
    uses: muvon/ci-workflow/.github/workflows/brief.yml@master
    secrets: inherit
```

Configure provider keys (`OLLAMA_API_KEY`, `OPENROUTER_API_KEY`, …) once as
**organization secrets** with visibility "all repositories" — every repo inherits
them via `secrets: inherit`. Repo-level secrets also work.

## Overrides

```yaml
jobs:
  brief:
    uses: muvon/ci-workflow/.github/workflows/brief.yml@master
    secrets: inherit
    with:
      role: developer:brief
      model: openrouter:anthropic/claude-sonnet-4
      comment: compact
```

## Inputs

| Input     | Default              | Description                                |
| --------- | -------------------- | ------------------------------------------ |
| `role`    | `developer:brief`    | Octomind role                              |
| `model`   | `ollama:glm-5.1`     | Model override                             |
| `comment` | `full`               | PR comment mode: `full`, `compact`, `none` |

## Supported provider secrets

Passed through automatically when present in the caller (via `secrets: inherit`):

- `OLLAMA_API_KEY`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `GROQ_API_KEY`
- `DEEPSEEK_API_KEY`

Add more in `.github/workflows/brief.yml` as needed.
