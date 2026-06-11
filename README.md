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

| Input       | Default        | Description                                                              |
| ----------- | -------------- | ------------------------------------------------------------------------ |
| `tag`       | pushed tag ref | Release tag (set explicitly for `workflow_dispatch` callers)             |
| `artifacts` | _(none)_       | Artifact name pattern to download and attach to the release              |
| `draft`     | `true`         | Keep as draft; `false` publishes after all artifacts are attached        |

### Outputs

| Output      | Description                                          |
| ----------- | ---------------------------------------------------- |
| `version`   | Resolved release version                             |
| `changelog` | Extracted changelog section for the released version |

## Rust CI (`rust-ci.yml`)

Standard CI for Rust projects: `fmt`, `check`, `clippy`, `test` (Linux/Windows/macOS
matrix + beta/nightly on Linux), `doc`, `security` (cargo-audit), `coverage`
(tarpaulin + Codecov). Uses `Swatinem/rust-cache` and disables incremental
compilation/debuginfo to keep runner disks small.

```yaml
# .github/workflows/ci.yml
on:
  push: { branches: [master, main, develop] }
  pull_request: { branches: [master, main, develop] }

jobs:
  rust:
    uses: muvon/ci-workflow/.github/workflows/rust-ci.yml@master
    with:
      feature-flags: '--all-features'
```

### Inputs

| Input           | Default                            | Description                                                        |
| --------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `toolchain`     | `1.95.0`                           | Rust toolchain version (bump here → propagates to all repos)        |
| `feature-flags` | _(none)_                           | Flags for `cargo check`/`clippy`/`doc` (e.g. `--all-features`)      |
| `setup-protoc`  | `false`                            | Install protoc before building                                      |
| `tools`         | _(none)_                           | Extra tools via `taiki-e/install-action` (e.g. `ripgrep,ast-grep`)  |
| `test`          | `true`                             | Disable to keep a project-specific test job in the caller           |
| `test-script`   | `cargo test --verbose`             | Shell script for the test step (bash on all platforms)              |
| `doc`           | `true`                             | Run `cargo doc` with `-D warnings`                                  |
| `coverage`      | `true`                             | Run tarpaulin and upload to Codecov                                 |
| `tarpaulin-args`| `--verbose --timeout 120 --out xml`| Arguments for `cargo tarpaulin`                                     |

## Rust Publish (`rust-publish.yml`)

Publishes a crate to crates.io: validates the tag matches `Cargo.toml` version,
skips if already published, dry-runs, then publishes. Crate name is read from
`Cargo.toml` — nothing project-specific to configure.

Requires the `CARGO_REGISTRY_TOKEN` secret (`secrets: inherit` with an org-level
secret, or pass explicitly).

### Inputs

| Input           | Default        | Description                                              |
| --------------- | -------------- | -------------------------------------------------------- |
| `tag`           | pushed tag ref | Version tag (set explicitly for `workflow_dispatch`)     |
| `publish-flags` | _(none)_       | Flags for `cargo publish` (e.g. `--no-default-features`) |
| `setup-protoc`  | `false`        | Install protoc before building                           |
| `toolchain`     | `1.95.0`       | Rust toolchain version                                   |

## Shipping a Rust project

The full pattern — CI on every push/PR, release on tag. Project-specific jobs
(binary builds, docker, etc.) stay in the project and hand artifacts to the
common release via `actions/upload-artifact`:

```yaml
# .github/workflows/ci.yml
on:
  push: { branches: [master, main, develop] }
  pull_request: { branches: [master, main, develop] }

jobs:
  rust:
    uses: muvon/ci-workflow/.github/workflows/rust-ci.yml@master
  brief:
    uses: muvon/ci-workflow/.github/workflows/brief.yml@master
    secrets: inherit
```

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['[0-9]+.[0-9]+.[0-9]+*']
  workflow_dispatch:
    inputs:
      tag: { description: 'Tag to release', required: true, type: string }

jobs:
  publish-crate:
    uses: muvon/ci-workflow/.github/workflows/rust-publish.yml@master
    secrets: inherit
    with:
      tag: ${{ inputs.tag }}

  release:
    needs: publish-crate
    uses: muvon/ci-workflow/.github/workflows/release.yml@master
    with:
      tag: ${{ inputs.tag }}
      draft: false
```

Keep `CHANGELOG.md` updated per version (`## [X.Y.Z]` headings) — the release
body comes from it. Reference setups: `muvon/octolib` (library, simple),
`muvon/octomind` (binary matrix builds, docker, homebrew).
