#!/bin/sh
# Builds the publishable @muvon/<name> package directory from the current repo
# checkout. Used by npm-publish.yml and runnable by hand:
#
#   cd ~/Work/dev/muvon/octofs
#   sh ../ci-workflow/npm/pack.sh 0.8.1
#   npm publish --access public ./npm-dist
#
# Metadata comes from server.json so npm and the MCP registry cannot drift.
set -eu

VERSION="${1:-}"
OUT="${2:-npm-dist}"
SRC=$(cd "$(dirname "$0")" && pwd)

[ -f server.json ] || { echo "server.json not found — run from the project root" >&2; exit 1; }

mkdir -p "$OUT"
cp "$SRC/cli.js" "$OUT/cli.js"
cp README.md "$OUT/README.md"

VERSION="$VERSION" OUT="$OUT" python3 - <<'PYEOF'
import json, os

server = json.load(open('server.json'))
out = os.environ['OUT']

repo = server['repository']['url'].replace('https://github.com/', '').removesuffix('.git')
name = repo.split('/')[1]
version = os.environ['VERSION'] or server['version']

json.dump({
    'name': f'@muvon/{name}',
    'version': version,
    'description': server['description'],
    # What the MCP registry checks to prove ownership of the npm package.
    'mcpName': server['name'],
    'bin': {name: 'cli.js'},
    'files': ['cli.js'],
    'license': 'Apache-2.0',
    'homepage': server.get('websiteUrl', f'https://github.com/{repo}'),
    'repository': {'type': 'git', 'url': f'git+https://github.com/{repo}.git'},
    'engines': {'node': '>=18'},
}, open(f'{out}/package.json', 'w'), indent=2)
PYEOF

cat "$OUT/package.json"
