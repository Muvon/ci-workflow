# ci-workflow

Reusable GitHub Actions workflows for Muvon repos.

Pin to `@master` — no versioning. Change behavior here, propagates to every repo.

## PR Brief (`brief.yml`)

Generates PR briefs using [Octomind](https://octomind.run).

Wraps [`muvon/octomind-action`](https://github.com/muvon/octomind-action) and:

- Picks the prompt automatically based on the PR event action
  - `synchronize` → incremental diff between `before`/`after` SHAs
  - anything else (`opened`, `reopened`, `ready_for_review`, …) → full branch-vs-base
- Defaults to `developer:brief` role, `ollama:glm-5.1` model, `full` comment mode
- Inherits provider API keys from caller secrets — no per-repo env wiring

### Usage

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

Configure once at the **organization** level (visibility "all repositories"):

- **Variable** `OCTOHUB_API_URL` — Octohub API endpoint
- **Secret** `OCTOHUB_API_KEY` — Octohub API key

Org `vars` are inherited automatically by reusable workflows; secrets are inherited
via `secrets: inherit`. Repo-level overrides also work.

### Overrides

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

### Inputs

| Input     | Default              | Description                                |
| --------- | -------------------- | ------------------------------------------ |
| `role`    | `developer:brief`    | Octomind role                              |
| `model`   | `ollama:glm-5.1`     | Model override                             |
| `comment` | `full`               | PR comment mode: `full`, `compact`, `none` |

### Env passed to octomind-action

| Name              | Source                       |
| ----------------- | ---------------------------- |
| `OCTOHUB_API_URL` | `vars.OCTOHUB_API_URL`       |
| `OCTOHUB_API_KEY` | `secrets.OCTOHUB_API_KEY`    |

## Release (`release.yml`)

Creates a GitHub release with notes taken from `CHANGELOG.md`:

- Resolves the version from the pushed tag (or `tag` input) and validates semver
- Extracts the `## [X.Y.Z]` section from `CHANGELOG.md` as the release body — fails if the section is missing
- Marks `0.x` and `-prerelease` versions as prereleases
- Skips creation if the release already exists (idempotent re-runs)
- Optionally downloads workflow artifacts and attaches them to the release

Requires `contents: write` on the caller's `GITHUB_TOKEN`.

### Usage

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['[0-9]+.[0-9]+.[0-9]+*']

jobs:
  release:
    uses: muvon/ci-workflow/.github/workflows/release.yml@master
```

With artifacts built in a previous job (uploaded via `actions/upload-artifact`):

```yaml
jobs:
  build:
    # ... builds binaries, uploads artifacts named bin-<target> ...
  release:
    needs: build
    uses: muvon/ci-workflow/.github/workflows/release.yml@master
    with:
      artifacts: 'bin-*'
      draft: false
```

### Inputs

| Input       | Default        | Description                                                      |
| ----------- | -------------- | ---------------------------------------------------------------- |
| `tag`       | pushed tag ref | Release tag (set explicitly for `workflow_dispatch` callers)     |
| `artifacts` | _(none)_       | Artifact name pattern to download and attach to the release      |
| `draft`     | `true`         | Create as draft (caller un-drafts later) or publish immediately  |

### Outputs

| Output      | Description                                          |
| ----------- | ---------------------------------------------------- |
| `version`   | Resolved release version                             |
| `changelog` | Extracted changelog section for the released version |
